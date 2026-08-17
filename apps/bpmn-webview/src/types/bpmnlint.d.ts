/**
 * `bpmn-js-bpmnlint` exports a single bpmn-js DI module with no types.
 *
 * The shipping product lints in the extension host (so it can resolve custom
 * `bpmnlint-plugin-*` rules against the workspace), so the overlay module is all
 * the production webview needs. The remaining declarations type the deep
 * `bpmnlint` entry points used only by the dev-only `browserLintRunner`, which
 * runs the built-in `recommended` rules in the standalone Vite preview (where no
 * host is available) and is tree-shaken from production builds. bpmnlint ships
 * no types and no `exports` map, so these are imported by path; rule/config
 * shapes are opaque (they pass straight through to the resolver/linter), so
 * `unknown` is the honest type.
 */
declare module "bpmn-js-bpmnlint" {
    const lintModule: unknown;
    export default lintModule;
}

declare module "bpmnlint" {
    export class Linter {
        constructor(options: { config: unknown; resolver: unknown });
        lint(moddleRoot: unknown): Promise<Record<string, unknown[]>>;
    }
}

declare module "bpmnlint/lib/resolver/static-resolver" {
    export default class StaticResolver {
        constructor(cache: Record<string, unknown>);
        resolveRule(pkg: string, ruleName: string): unknown;
        resolveConfig(pkg: string, configName: string): unknown;
    }
}

declare module "bpmnlint/config/*" {
    const config: Record<string, unknown>;
    export default config;
}

declare module "bpmnlint/rules/*" {
    const rule: unknown;
    export default rule;
}
