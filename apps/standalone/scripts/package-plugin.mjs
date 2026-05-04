#!/usr/bin/env node
/**
 * Why this script exists:
 *   The standalone Theia/Electron app loads the BPMN modeler as a regular
 *   VS Code extension, which means we have to package the freshly-built
 *   `dist/apps/modeler-plugin/` output as a `.vsix` before it can be
 *   un-zipped into `apps/standalone/plugins/` (see `bundle-extension.mjs`).
 *
 *   Doing the cd + vsce dance inline in `package.json` was brittle:
 *     - hardcoded `cd ../../dist/apps/...` only works from one CWD
 *     - silent failure if the plugin output is missing (no helpful error)
 *
 *   This wrapper resolves the path from `__filename`, fails loudly with
 *   actionable instructions when the plugin output is absent, and shells
 *   out to `vsce` once the preconditions are met.
 *
 * Used by:
 *   - `apps/standalone/package.json` script `package-plugin`
 *   - transitively by `prepare-plugin` and `dev`
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, "..", "..", "..", "dist", "apps", "modeler-plugin");

if (!existsSync(resolve(pluginDir, "package.json"))) {
    console.error(`ERROR: ${pluginDir}/package.json not found.`);
    console.error("Run `corepack yarn build` at the repo root first to produce the modeler plugin output.");
    process.exit(1);
}

execFileSync(
    "vsce",
    ["package", "--out", "bpmn-modeler-plugin.vsix", "--yarn", "--no-dependencies"],
    { cwd: pluginDir, stdio: "inherit" },
);
