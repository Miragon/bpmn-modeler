import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { defineConfig } from "@vscode/test-cli";

// `import.meta.dirname` (Node 20.11+) avoids pulling `URL`/`fileURLToPath` into
// this ESM config, which the shared flat ESLint config does not grant globals to.
const here = import.meta.dirname;
// repo root: apps/modeler-plugin/test/e2e → ../../../..
const repoRoot = resolve(here, "../../../..");

// webpack assembles the runnable extension (compiled main.js + a copied
// package.json + themes + the three webview bundles) here; pointing at the
// source `apps/modeler-plugin` would fail because `main: "main.js"` only
// resolves in the dist dir. So `corepack yarn build` is a prerequisite.
const extensionDevelopmentPath = resolve(repoRoot, "dist/apps/modeler-plugin");

// A throwaway folder so the host opens a real (empty) workspace without
// inheriting any user/project settings that could perturb activation.
const workspace = mkdtempSync(resolve(tmpdir(), "bpmn-modeler-e2e-"));

export default defineConfig({
    label: "modeler-plugin-smoke",
    // Must stay relative: @vscode/test-cli only glob-expands relative `files`
    // (against this config's directory); an absolute path is taken literally.
    files: "out/**/*.test.js",
    extensionDevelopmentPath,
    // `--disable-extensions` isolates from any other installed extensions; the
    // extension under test still loads via `extensionDevelopmentPath`.
    launchArgs: [workspace, "--disable-extensions"],
    mocha: {
        ui: "tdd",
        // Electron's first launch downloads + unpacks; the activation path also
        // builds every feature, so allow generous headroom over the 2s default.
        timeout: 60_000,
    },
});
