/**
 * Ambient declaration for the Camunda 7 moddle descriptor JSON.
 *
 * `resolveJsonModule` is off in `tsconfig.base.json`, so a bare import of the
 * `.json` would not typecheck. {@link ScriptXmlService} feeds this descriptor
 * set to bpmn-moddle so a host-side XML round-trip parses the same `camunda:`
 * extension elements the C7 webview registers. The shape is opaque to us —
 * bpmn-moddle consumes it — so a single `unknown` export suffices.
 */
declare module "camunda-bpmn-moddle/resources/camunda.json" {
    const descriptors: unknown;
    export default descriptors;
}
