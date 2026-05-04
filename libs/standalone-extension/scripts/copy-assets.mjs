#!/usr/bin/env node
/**
 * Why this script exists:
 *   `tsc` only compiles `.ts` and ignores everything else. Our compiled
 *   modules in `lib/` import sibling assets via relative paths, e.g.
 *     - `frontend-module.js`        → `require("./styles/miragon.css")`
 *     - `miragon-theme-contribution.js` → `require("./themes/miragon-*.json")`
 *   Those relative paths are resolved by the standalone app's webpack at
 *   bundle time, so the assets must physically sit next to the JS in `lib/`.
 *
 * What it does:
 *   After `tsc` writes JS into `lib/`, copy `src/styles/` and `src/themes/`
 *   recursively into `lib/styles/` and `lib/themes/`. Run as the second step
 *   of the package's `build` script.
 *
 * Why not a third-party tool:
 *   `cpx2` / `copyfiles` would do the same with an extra dependency. A
 *   20-line stdlib script is the lower-maintenance choice.
 */
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(root, "src");
const libDir = resolve(root, "lib");

const assets = ["styles", "themes"];
for (const asset of assets) {
    const from = resolve(srcDir, asset);
    const to = resolve(libDir, asset);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log(`copied ${from} -> ${to}`);
}
