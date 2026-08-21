import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
// Imported rather than used as a global: the shared flat ESLint config grants no
// Node globals to this ESM config (same reason `import.meta.dirname` is used below).
import process from "node:process";

import { defineConfig } from "@vscode/test-cli";

// `import.meta.dirname` (Node 20.11+) avoids pulling `URL`/`fileURLToPath` into
// this ESM config, which the shared flat ESLint config does not grant globals to.
const here = import.meta.dirname;
// repo root: apps/vscode-plugin/test/e2e → ../../../..
const repoRoot = resolve(here, "../../../..");

// webpack assembles the runnable extension (compiled main.js + a copied
// package.json + the three webview bundles) here; pointing at the
// source `apps/vscode-plugin` would fail because `main: "main.js"` only
// resolves in the dist dir. So `corepack yarn build` is a prerequisite.
const extensionDevelopmentPath = resolve(repoRoot, "dist/apps/vscode-plugin");

// A throwaway folder so the host opens a real (empty) workspace without
// inheriting any user/project settings that could perturb activation.
const workspace = mkdtempSync(resolve(tmpdir(), "bpmn-modeler-e2e-"));

// Electron opens a unix socket under the user-data dir; macOS limits socket
// paths to 103 chars, so the default `.vscode-test/user-data` under a deep
// checkout fails with `listen EINVAL`. A short temp dir sidesteps that.
const userDataDir = mkdtempSync(resolve(tmpdir(), "bpmn-modeler-ud-"));

// `@vscode/test-cli` has no teardown hook, so the temp dirs would otherwise
// accumulate one orphaned dir per local run. Remove them when the test process
// exits (any cause); `force` swallows the already-gone case.
process.on("exit", () => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
});

export default defineConfig({
    label: "vscode-plugin-smoke",
    // Must stay relative: @vscode/test-cli only glob-expands relative `files`
    // (against this config's directory); an absolute path is taken literally.
    files: "out/**/*.test.js",
    extensionDevelopmentPath,
    // `--disable-extensions` isolates from any other installed extensions; the
    // extension under test still loads via `extensionDevelopmentPath`.
    launchArgs: [workspace, "--disable-extensions", "--user-data-dir", userDataDir],
    mocha: {
        ui: "tdd",
        // Electron's first launch downloads + unpacks; the activation path also
        // builds every feature, so allow generous headroom over the 2s default.
        timeout: 60_000,
    },
});
