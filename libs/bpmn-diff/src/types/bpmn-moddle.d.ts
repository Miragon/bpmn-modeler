/**
 * Minimal ambient shim for `bpmn-moddle`, which ships no `.d.ts`.
 *
 * `loadBpmnModdle` treats the dynamic moddle import as `unknown` and casts it, so it
 * needs the module to *resolve* but never its member types. An empty module
 * declaration does exactly that — and, unlike a richer shim, it merges without
 * conflict alongside a consumer program's own `bpmn-moddle` declaration
 * (the package ships a fuller one for its specs). Keeping this empty is what
 * lets the differ lib be pulled into any program, including those with no moddle
 * shim of their own.
 */
declare module "bpmn-moddle" {}
