/**
 * Minimal ambient shim for `bpmn-moddle`, which ships no `.d.ts`.
 *
 * `computeDiff` casts the dynamic moddle import fully (`as unknown as …`), so it
 * needs the module to *resolve* but never its member types. An empty module
 * declaration does exactly that — and, unlike a richer shim, it merges without
 * conflict alongside a consumer program's own `bpmn-moddle` declaration
 * (modeler-core and the package each ship a fuller one with divergent shapes).
 * Keeping this empty is what lets the differ lib be pulled into any of those
 * programs — including `modeler-types`, which has no moddle shim of its own.
 */
declare module "bpmn-moddle" {}
