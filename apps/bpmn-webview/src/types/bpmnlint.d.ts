/**
 * `bpmn-js-bpmnlint` exports a single bpmn-js DI module with no types. The
 * linter itself now runs in the extension host (so it can resolve custom
 * `bpmnlint-plugin-*` rules against the workspace), so the webview no longer
 * imports `bpmnlint`'s rules/configs/resolver by path — only the overlay module.
 */
declare module "bpmn-js-bpmnlint" {
    const lintModule: unknown;
    export default lintModule;
}
