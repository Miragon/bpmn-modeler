import { dirname } from "path";

import { ElementIdConventionOptions, LintResults } from "@miragon/bpmn-modeler-types";

import { createBundledResolver } from "@miragon/bpmnlint-plugin-rules";

import { TRUSTED_WORKSPACE } from "../../../../../kernel/adapter/out/TrustedWorkspace";
import { CodeApproval } from "../../../../../kernel/domain/codeApproval";
import { fileSystemPathOf, toWorkspacePath } from "../../../../../kernel/domain/workspacePath";
import {
    ELEMENT_ID_NAMING_RULE,
    elementIdConventionOptionsOf,
} from "../../../domain/elementIdConvention";
import { PathStamp } from "../../../domain/installedPackage";
import { isParsedAsJson, rulePackageApprovalsKey } from "../../../domain/rulePackageApproval";
import { LintRun, LintRunnerPort } from "../../../port/bpmnPorts";
import { CompositeResolver, Resolver } from "./CompositeResolver";
import { RulePackageGate, RulePackageSources } from "./RulePackageGate";

// bpmnlint ships no type declarations; its entry points are typed by the ambient
// shim in `src/types/bpmnlint.d.ts`, picked up through each tsconfig's `include`.
import { Linter } from "bpmnlint";
import NodeResolver from "bpmnlint/lib/resolver/node-resolver";
import { createScopedRequire } from "bpmnlint/lib/resolver/helper";

/**
 * `bpmn-moddle`'s default export is a factory that returns a moddle instance
 * pre-loaded with the core BPMN packages, optionally merged with additional
 * (e.g. Camunda) moddle extensions — the same call `bpmnlint`'s CLI uses.
 */
type BpmnModdleFactory = (extensions?: Record<string, unknown>) => BpmnModdle;

interface BpmnModdle {
    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
}

/** Everything a lint run needs that depends only on the config version. */
interface LintSetup {
    readonly moddle: BpmnModdle;
    readonly resolvers: readonly Resolver[];
    readonly resolved: Map<string, unknown>;
    readonly moddleExtensionMisses: readonly string[];
    readonly gate?: RulePackageGate;
    /** Built without a gate because the user did not trust the workspace. */
    readonly untrusted: boolean;
}

/** The rule packages a lint setup may run: those the rows it was built for allow. */
interface WorkspaceRules {
    readonly sources: RulePackageSources;
    readonly approvals: readonly CodeApproval[];
}

interface CachedLintSetup {
    readonly configFingerprint: string;
    readonly setup: Promise<LintSetup>;
}

/**
 * Runs bpmnlint in a full Node context (the VS Code extension host or the
 * IntelliJ bridge) so it resolves the rules the `bpmnlint` CLI would:
 * built-ins, `plugin:<pkg>/recommended`, and custom `pkg/rule` packages from the
 * workspace `node_modules`, rooted at the `.bpmnlintrc` directory (so monorepos
 * with per-module configs keep working).
 *
 * Resolution is a {@link CompositeResolver}: the workspace's rule packages
 * first, then `@miragon/bpmnlint-plugin-rules`' bundled resolver (bpmnlint
 * built-ins + camunda-compat engine layers + the Miragon rules), so a workspace
 * without those installed still lints. Built-ins never come from the workspace.
 * A workspace package runs only through a {@link RulePackageGate}, once the
 * user allowed it; a linter built without {@link RulePackageSources}, or in a
 * workspace the user did not trust, asks the workspace for nothing. A rule the
 * workspace declares but cannot provide (plugin not installed or not allowed)
 * is skipped and reported, never fatal.
 *
 * The moddle, the loaded extensions and the resolved rules are kept per config
 * path until the config, the rule package approvals or the trust change, or an
 * allowed package's `package.json` does, so an edit only pays for the parse and
 * the rules.
 *
 * Host-agnostic on purpose (no `vscode` import): the IntelliJ bridge, a Bun
 * process, reuses it verbatim.
 */
export class NodeBpmnLinter implements LintRunnerPort {
    private readonly setupsByConfigPath = new Map<string, CachedLintSetup>();
    private bundledResolver: Resolver | undefined;
    private moddleFactory: Promise<BpmnModdleFactory> | undefined;
    private readonly loadedManifestStamps = new Map<string, PathStamp | undefined>();

    constructor(private readonly rulePackages?: RulePackageSources) {}

    async lint(
        xml: string,
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<LintRun> {
        const setup = await this.currentLintSetup(configPath, config);

        const resolver = new CompositeResolver(setup.resolvers, setup.resolved, setup.gate);
        resolver.unresolved.push(...setup.moddleExtensionMisses);
        const { rootElement } = await setup.moddle.fromXML(xml);

        // Never reuse a Linter: it caches rule instances, and rules keep per-run
        // state in their closures (`no-duplicate-sequence-flows` would flag every
        // flow from the second run on).
        const linter = new Linter({ config, resolver });
        const results = (await linter.lint(rootElement)) as LintResults;

        return {
            results,
            unresolved: resolver.unresolved,
            blocked: setup.gate?.blockedPackages(resolver.neededBlocked) ?? [],
            refused: setup.gate?.refusedModules() ?? [],
            untrusted: setup.untrusted,
        };
    }

    async elementIdConventionOptions(
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<ElementIdConventionOptions> {
        const setup = await this.currentLintSetup(configPath, config);
        const resolver = new CompositeResolver(setup.resolvers, setup.resolved, setup.gate);
        try {
            const rules = await new Linter({ config, resolver }).resolveConfiguredRules(config);
            return elementIdConventionOptionsOf(rules[ELEMENT_ID_NAMING_RULE]);
        } catch {
            return {};
        }
    }

    /** Checked before every run: once cached, an allowed package's rules never reach the gate again. */
    private async currentLintSetup(
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<LintSetup> {
        const pending = this.lintSetupFor(configPath, config);
        const setup = await pending;
        if (setup.gate?.isUnchanged() !== false) {
            return setup;
        }
        this.forgetSetup(configPath, pending);
        return this.lintSetupFor(configPath, config);
    }

    private lintSetupFor(configPath: string, config: Record<string, unknown>): Promise<LintSetup> {
        const approvals = this.rulePackages?.approvals.read() ?? [];
        const trusted = (this.rulePackages?.trust ?? TRUSTED_WORKSPACE).isTrusted();
        const configFingerprint = `${JSON.stringify(config)}\0${rulePackageApprovalsKey(approvals)}\0${trusted}`;
        const cached = this.setupsByConfigPath.get(configPath);
        if (cached?.configFingerprint === configFingerprint) {
            return cached.setup;
        }

        const workspaceRules =
            this.rulePackages && trusted ? { sources: this.rulePackages, approvals } : undefined;
        const setup = this.createLintSetup(configPath, config, workspaceRules, {
            untrusted: this.rulePackages !== undefined && !trusted,
        });
        this.setupsByConfigPath.set(configPath, { configFingerprint, setup });
        const forget = () => this.forgetSetup(configPath, setup);
        // A missing moddle extension may be installed later; retry it next run.
        setup.then((created) => {
            if (created.moddleExtensionMisses.length > 0) {
                forget();
            }
        }, forget);
        return setup;
    }

    private forgetSetup(configPath: string, setup: Promise<LintSetup>): void {
        if (this.setupsByConfigPath.get(configPath)?.setup === setup) {
            this.setupsByConfigPath.delete(configPath);
        }
    }

    /** Without `workspaceRules` no gate is built, so the workspace is asked for nothing. */
    private async createLintSetup(
        configPath: string,
        config: Record<string, unknown>,
        workspaceRules: WorkspaceRules | undefined,
        { untrusted }: Pick<LintSetup, "untrusted">,
    ): Promise<LintSetup> {
        const configDir = dirname(fileSystemPathOf(configPath));
        const scopedRequire = createScopedRequire(configDir);
        const { extensions, misses } = loadModdleExtensions(config, scopedRequire);
        const moddle = (await this.loadModdleFactory())(extensions);
        this.bundledResolver ??= createBundledResolver() as Resolver;
        const gate =
            workspaceRules &&
            new RulePackageGate({
                ...workspaceRules,
                configDir: toWorkspacePath(configDir),
                loadedManifestStamps: this.loadedManifestStamps,
                requireFrom: createScopedRequire,
            });

        return {
            moddle,
            resolvers: gate
                ? [workspaceRulePackages(gate.require(scopedRequire)), this.bundledResolver]
                : [this.bundledResolver],
            resolved: new Map(),
            moddleExtensionMisses: misses,
            gate,
            untrusted,
        };
    }

    private loadModdleFactory(): Promise<BpmnModdleFactory> {
        this.moddleFactory ??= importModdleFactory();
        return this.moddleFactory;
    }
}

/**
 * Resolves the config's `moddleExtensions` (`{ prefix: value }`) so rules that
 * inspect Camunda/Zeebe properties see the same typed model the CLI does.
 *
 * A workspace `.bpmnlintrc` declares each extension as a module-path string,
 * resolved from the workspace and loaded only when it is a JSON descriptor. The
 * zero-config default instead embeds the descriptor object directly (see
 * {@link DefaultBpmnlintConfigService}) because a config-less workspace has no
 * `node_modules` to resolve it from — those pass straight through. A string
 * that is missing or names a script is skipped and recorded rather than
 * aborting the lint.
 */
function loadModdleExtensions(
    config: Record<string, unknown>,
    scopedRequire: NodeRequire,
): { extensions: Record<string, unknown>; misses: string[] } {
    const extensions: Record<string, unknown> = {};
    const misses: string[] = [];
    const declared = config.moddleExtensions;
    if (!declared || typeof declared !== "object") {
        return { extensions, misses };
    }

    for (const [prefix, value] of Object.entries(declared as Record<string, unknown>)) {
        if (value && typeof value === "object") {
            extensions[prefix] = value;
            continue;
        }
        const descriptor = jsonDescriptor(String(value), scopedRequire);
        if (descriptor === undefined) {
            misses.push(`moddleExtension:${prefix}`);
        } else {
            extensions[prefix] = descriptor;
        }
    }
    return { extensions, misses };
}

/**
 * Loads a descriptor only when the reference resolves to a `.json` file, which
 * `require` parses instead of running.
 */
function jsonDescriptor(reference: string, scopedRequire: NodeRequire): unknown {
    try {
        const resolved = scopedRequire.resolve(reference);
        return isParsedAsJson(toWorkspacePath(resolved)) ? scopedRequire(resolved) : undefined;
    } catch {
        return undefined;
    }
}

const BPMNLINT_CORE = "bpmnlint";

/**
 * The workspace's `bpmnlint-plugin-*` packages. bpmnlint's own rules and
 * configs always come from the bundle: through the workspace, NodeResolver
 * would run the workspace's `bpmnlint` install or, via `requireLocal`, scripts
 * two folders above the config.
 */
function workspaceRulePackages(scopedRequire: NodeRequire): Resolver {
    const nodeResolver = new NodeResolver({
        require: scopedRequire,
        requireLocal: refuseLocalRequire,
    });
    const refuseCore = (pkg: string) => {
        if (pkg === BPMNLINT_CORE) {
            throw new Error("bpmnlint's own rules and configs come from the bundle");
        }
    };
    return {
        resolveRule(pkg, ruleName) {
            refuseCore(pkg);
            return nodeResolver.resolveRule(pkg, ruleName);
        },
        resolveConfig(pkg, configName) {
            refuseCore(pkg);
            return nodeResolver.resolveConfig(pkg, configName);
        },
    };
}

const refuseLocalRequire = ((id: string) => {
    throw new Error(`Refused to load ${id} relative to the config folder`);
}) as unknown as NodeRequire;

/**
 * `bpmn-moddle` has no `default` export on some bundler interops — its ESM
 * dist re-exports the factory as `BpmnModdle` too. Accept both (mirrors
 * `BpmnDiffService`).
 */
async function importModdleFactory(): Promise<BpmnModdleFactory> {
    const mod = (await import("bpmn-moddle")) as unknown as {
        default?: BpmnModdleFactory;
        BpmnModdle?: BpmnModdleFactory;
    };
    const factory = mod.default ?? mod.BpmnModdle;
    if (typeof factory !== "function") {
        throw new Error("bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.");
    }
    return factory;
}

