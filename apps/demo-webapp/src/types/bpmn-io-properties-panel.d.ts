// `@bpmn-io/properties-panel` ships dist-only with no type declarations. This
// shorthand ambient module types every import from the main entry (Group,
// *Entry components) as `any` so the demo's custom-group provider can consume
// them without implicit-any errors — mirroring the same shim in
// libs/properties-panel and packages/bpmn-modeler.
declare module "@bpmn-io/properties-panel";
