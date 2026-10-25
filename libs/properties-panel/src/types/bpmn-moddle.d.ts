/**
 * `bpmn-moddle` ships no `.d.ts`. Deliberately empty: the test harness casts
 * the import, so the module only needs to resolve, and an empty declaration
 * merges with the richer shims other workspaces ship.
 */
declare module "bpmn-moddle" {}
