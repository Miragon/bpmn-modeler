/**
 * `bpmnlint` ships no type declarations and no `exports` map, so its top-level
 * `Linter` and deep entry points (resolvers, the scoped-require helper, the
 * built-in rules/configs) are imported by path. Rule/config shapes are opaque —
 * they only ever pass straight through to the resolver / linter — so `unknown`
 * is the honest type.
 *
 * This is an ambient shim (no top-level `import`/`export`, so `declare module`
 * declares rather than augments — the only form that can type an untyped existing
 * JS module). Each consuming tsconfig references it via `include` so the webpack
 * (VS Code) and Bun (bridge) builds see it without a triple-slash reference.
 */
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

declare module "bpmnlint/lib/resolver/node-resolver" {
    export default class NodeResolver {
        constructor(options: { require: NodeRequire; requireLocal: NodeRequire });
        resolveRule(pkg: string, ruleName: string): unknown;
        resolveConfig(pkg: string, configName: string): unknown;
    }
}

declare module "bpmnlint/lib/resolver/helper" {
    export function createScopedRequire(cwd: string): NodeRequire;
}

declare module "bpmnlint/config/*" {
    const config: Record<string, unknown>;
    export default config;
}

declare module "bpmnlint/rules/*" {
    const rule: unknown;
    export default rule;
}
