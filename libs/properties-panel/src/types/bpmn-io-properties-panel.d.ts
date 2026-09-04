// `@bpmn-io/properties-panel` ships dist-only with no type declarations (its
// `/preact` subpath re-exports the vendored preact, which *is* typed). This
// shorthand ambient module types every import from the main entry (Group,
// *Entry components, hooks, DI modules) as `any` so the fork can consume them
// without implicit-any errors. Mirrors how the repo shims other untyped bpmn-io
// deps (see packages/bpmn-modeler/src/types/*.d.ts).
declare module "@bpmn-io/properties-panel";
