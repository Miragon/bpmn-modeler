/**
 * Ambient declaration for the Zeebe (Camunda 8) moddle descriptor JSON.
 *
 * `resolveJsonModule` is off in `tsconfig.base.json`, so a bare import of the
 * `.json` would not typecheck. The bundled default lint config feeds this
 * descriptor to bpmn-moddle so a host-side parse sees the typed `zeebe:` extension
 * elements the camunda-compat C8 rules inspect. The shape is opaque to us —
 * bpmn-moddle consumes it — so a single `unknown` export suffices.
 */
declare module "zeebe-bpmn-moddle/resources/zeebe.json" {
    const descriptors: unknown;
    export default descriptors;
}
