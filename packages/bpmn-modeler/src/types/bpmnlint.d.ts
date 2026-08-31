/**
 * `bpmn-js-bpmnlint` exports a single bpmn-js DI module with no types.
 */
declare module "bpmn-js-bpmnlint" {
    const lintModule: unknown;
    export default lintModule;
}

/**
 * `bpmnlint` ships no type declarations. The in-page linter drives only
 * `Linter` directly — it builds the rule/config resolver from
 * `@miragon/bpmnlint-plugin-rules` (which is typed), so this shim needs only the
 * one class the webview constructs. Rule/config shapes are opaque, passed
 * straight through to the resolver, so `unknown` is the honest type.
 */
declare module "bpmnlint" {
    export class Linter {
        constructor(options: { config: unknown; resolver: unknown });
        lint(moddleRoot: unknown): Promise<Record<string, unknown[]>>;
    }
}
