/**
 * `bpmnlint` ships no type declarations and no `exports` map, so its deep
 * entry points (rules, configs, the static resolver) are imported by path.
 * `bpmn-js-bpmnlint` exports a single bpmn-js DI module with no types either.
 * Rule/config shapes are opaque to us — they are only ever passed straight to
 * the resolver / linter — so `unknown` is the honest type.
 */
declare module "bpmn-js-bpmnlint" {
    const lintModule: unknown;
    export default lintModule;
}

declare module "bpmnlint/lib/resolver/static-resolver" {
    export default class StaticResolver {
        constructor(cache: Record<string, unknown>);
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
