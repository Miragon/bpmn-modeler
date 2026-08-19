import { dirname } from "path";

import { LintResults } from "@miragon/bpmn-modeler-shared";

import { LintRunnerPort } from "../../../../shared/domain/hostPorts";
import { builtinResolver } from "./builtinResolver";
import { bundledDefaultResolver } from "./bundledDefaultResolver";
import { CompositeResolver } from "./CompositeResolver";

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
type BpmnModdleFactory = (extensions?: Record<string, unknown>) => {
    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
};

/**
 * Runs bpmnlint in a full Node context (the VS Code extension host or the
 * IntelliJ bridge) so it resolves the same rules the `bpmnlint` CLI would:
 * built-ins, `plugin:<pkg>/recommended`, and custom `pkg/rule` packages from the
 * workspace `node_modules`, rooted at the `.bpmnlintrc` directory (so monorepos
 * with per-module configs keep working).
 *
 * Resolution is a {@link CompositeResolver}: workspace `NodeResolver` first, the
 * bundled built-ins as fallback so a workspace without `bpmnlint` installed still
 * lints against built-in rules. A rule the workspace declares but cannot provide
 * (plugin not installed) is skipped and reported, never fatal.
 *
 * Host-agnostic on purpose (no `vscode` import): the IntelliJ bridge, a Bun
 * process, reuses it verbatim.
 */
export class NodeBpmnLinter implements LintRunnerPort {
    async lint(
        xml: string,
        configPath: string,
        config: Record<string, unknown>,
        useBundledDefaults = false,
    ): Promise<{ results: LintResults; unresolved: string[] }> {
        const configDir = dirname(uriPathToFsPath(configPath));
        const scopedRequire = createScopedRequire(configDir);

        const resolver = new CompositeResolver(
            new NodeResolver({ require: scopedRequire, requireLocal: scopedRequire }),
            builtinResolver,
            ...(useBundledDefaults ? [bundledDefaultResolver] : []),
        );

        const moddleExtensions = this.loadModdleExtensions(config, scopedRequire, resolver);
        const moddle = (await this.createModdle())(moddleExtensions);
        const { rootElement } = await moddle.fromXML(xml);

        const linter = new Linter({ config, resolver });
        const results = (await linter.lint(rootElement)) as LintResults;

        return { results, unresolved: resolver.unresolved };
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
    private loadModdleExtensions(
        config: Record<string, unknown>,
        scopedRequire: NodeRequire,
        resolver: CompositeResolver,
    ): Record<string, unknown> {
        const declared = config.moddleExtensions;
        if (!declared || typeof declared !== "object") {
            return {};
        }

        const extensions: Record<string, unknown> = {};
        for (const [prefix, value] of Object.entries(declared as Record<string, unknown>)) {
            if (value && typeof value === "object") {
                extensions[prefix] = value;
                continue;
            }
            try {
                extensions[prefix] = scopedRequire(String(value));
            } catch {
                resolver.unresolved.push(`moddleExtension:${prefix}`);
            }
        }
        return extensions;
    }

    /**
     * `bpmn-moddle` has no `default` export on some bundler interops — its ESM
     * dist re-exports the factory as `BpmnModdle` too. Accept both (mirrors
     * `BpmnDiffService`).
     */
    private async createModdle(): Promise<BpmnModdleFactory> {
        const mod = (await import("bpmn-moddle")) as unknown as {
            default?: BpmnModdleFactory;
            BpmnModdle?: BpmnModdleFactory;
        };
        const factory = mod.default ?? mod.BpmnModdle;
        if (typeof factory !== "function") {
            throw new Error(
                "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
            );
        }
        return factory;
    }
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
