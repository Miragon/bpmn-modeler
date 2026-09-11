/**
 * Minimal ambient shim for `bpmn-moddle`, which ships no `.d.ts`.
 *
 * Deliberately empty, for the same reason as the one in `libs/bpmn-diff`: the
 * adapter casts its moddle import fully, so it needs the module to *resolve*
 * but never its member types — and an empty declaration merges without
 * conflict alongside the richer, divergent shims that modeler-core and the
 * package each ship.
 */
declare module "bpmn-moddle" {}
