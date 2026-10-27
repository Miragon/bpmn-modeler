import { dirname } from "path";

import { LintResults } from "@miragon/bpmn-modeler-types";

import { createBundledResolver } from "@miragon/bpmnlint-plugin-rules";

import { LintRunnerPort } from "../../domain/ports";
import { CompositeResolver, Resolver } from "./CompositeResolver";

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
}

interface CachedLintSetup {
    readonly configFingerprint: string;
    readonly setup: Promise<LintSetup>;
}

/**
 * Runs bpmnlint in a full Node context (the VS Code extension host or the
 * IntelliJ bridge) so it resolves the same rules the `bpmnlint` CLI would:
 * built-ins, `plugin:<pkg>/recommended`, and custom `pkg/rule` packages from the
 * workspace `node_modules`, rooted at the `.bpmnlintrc` directory (so monorepos
 * with per-module configs keep working).
 *
 * Resolution is a {@link CompositeResolver}: workspace `NodeResolver` first, then
 * `@miragon/bpmnlint-plugin-rules`' bundled resolver (bpmnlint built-ins + camunda-compat
 * engine layers + the Miragon rules) as fallback, so a workspace without those
 * installed still lints. A rule the workspace declares but cannot provide (plugin
 * not installed) is skipped and reported, never fatal.
 *
 * The moddle, the loaded extensions and the resolved rules are kept per config
 * path until the config changes, so an edit only pays for the parse and the rules.
 *
 * Host-agnostic on purpose (no `vscode` import): the IntelliJ bridge, a Bun
 * process, reuses it verbatim.
 */
export class NodeBpmnLinter implements LintRunnerPort {
    private readonly setupsByConfigPath = new Map<string, CachedLintSetup>();
    private bundledResolver: Resolver | undefined;
    private moddleFactory: Promise<BpmnModdleFactory> | undefined;

    async lint(
        xml: string,
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<{ results: LintResults; unresolved: string[] }> {
        const setup = await this.lintSetupFor(configPath, config);

        const resolver = new CompositeResolver(setup.resolvers, setup.resolved);
        resolver.unresolved.push(...setup.moddleExtensionMisses);
        const { rootElement } = await setup.moddle.fromXML(xml);

        // Never reuse a Linter: it caches rule instances, and rules keep per-run
        // state in their closures (`no-duplicate-sequence-flows` would flag every
        // flow from the second run on).
        const linter = new Linter({ config, resolver });
        const results = (await linter.lint(rootElement)) as LintResults;

        return { results, unresolved: resolver.unresolved };
    }

    private lintSetupFor(configPath: string, config: Record<string, unknown>): Promise<LintSetup> {
        const configFingerprint = JSON.stringify(config);
        const cached = this.setupsByConfigPath.get(configPath);
        if (cached?.configFingerprint === configFingerprint) {
            return cached.setup;
        }

        const setup = this.createLintSetup(configPath, config);
        this.setupsByConfigPath.set(configPath, { configFingerprint, setup });
        const forget = () => {
            if (this.setupsByConfigPath.get(configPath)?.setup === setup) {
                this.setupsByConfigPath.delete(configPath);
            }
        };
        // A missing moddle extension may be installed later; retry it next run.
        setup.then((created) => {
            if (created.moddleExtensionMisses.length > 0) {
                forget();
            }
        }, forget);
        return setup;
    }

    private async createLintSetup(
        configPath: string,
        config: Record<string, unknown>,
    ): Promise<LintSetup> {
        const scopedRequire = createScopedRequire(dirname(uriPathToFsPath(configPath)));
        const { extensions, misses } = loadModdleExtensions(config, scopedRequire);
        const moddle = (await this.loadModdleFactory())(extensions);
        this.bundledResolver ??= createBundledResolver() as Resolver;

        return {
            moddle,
            resolvers: [
                new NodeResolver({ require: scopedRequire, requireLocal: scopedRequire }),
                this.bundledResolver,
            ],
            resolved: new Map(),
            moddleExtensionMisses: misses,
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
 * `require`d from the workspace. The zero-config default instead embeds the
 * descriptor object directly (see {@link DefaultBpmnlintConfigService}) because
 * a config-less workspace has no `node_modules` to resolve it from — those
 * pass straight through. A string module that fails to load is skipped and
 * recorded rather than aborting the lint.
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
        try {
            extensions[prefix] = scopedRequire(String(value));
        } catch {
            misses.push(`moddleExtension:${prefix}`);
        }
    }
    return { extensions, misses };
}

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

/**
 * Converts a URI-style POSIX path (`.bpmnlintrc` paths arrive as `uri.path`, e.g.
 * `/c:/proj/.bpmnlintrc` on Windows) to an OS path Node's module resolution
 * accepts. Forward slashes are fine for Node on every platform; only the leading
 * slash before a drive letter has to go.
 */
function uriPathToFsPath(uriPath: string): string {
    return /^\/[a-zA-Z]:/.test(uriPath) ? uriPath.slice(1) : uriPath;
}
