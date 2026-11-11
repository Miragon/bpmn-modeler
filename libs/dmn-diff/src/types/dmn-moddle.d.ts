/**
 * `dmn-moddle` ships no `.d.ts`. `computeDmnDiff` casts the dynamic import, so the module only has to
 * resolve; an empty declaration also merges with a consumer program's own shim.
 */
declare module "dmn-moddle" {}
