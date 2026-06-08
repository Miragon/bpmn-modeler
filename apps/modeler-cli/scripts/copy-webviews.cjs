#!/usr/bin/env node
/**
 * Copies the pre-built bpmn-webview and dmn-webview bundles next to the
 * compiled CLI binary so the shipped artifact is self-contained.
 *
 * Expected upstream outputs (produced by `yarn build:libs`
 * + `yarn build:bpmn-webview` + `yarn build:dmn-webview`):
 *
 *   dist/webview-staging/bpmn-webview
 *   dist/webview-staging/dmn-webview
 *
 * Destination (run from apps/modeler-cli):
 *
 *   apps/modeler-cli/dist/webviews/bpmn-webview
 *   apps/modeler-cli/dist/webviews/dmn-webview
 *
 * The compiled binary resolves these relative to its own location
 * (`process.execPath`) — see `resolveWebviewRoot` in src/server.ts.
 */
const { promises: fsp, constants } = require("fs");
const path = require("path");

async function copyDir(src, dest) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            await fsp.copyFile(srcPath, destPath);
        }
    }
}

/** Collects absolute paths of every file under `dir`, recursively. */
async function collectFiles(dir) {
    const out = [];
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await collectFiles(full)));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Hoists the icon-font assets out of the `node_modules/…` directory that the
 * webview's vite static-copy glob produces, then removes that directory.
 *
 * Two reasons: (1) the served tree must not contain a folder named
 * `node_modules`, which CodeQL flags as `js/exposure-of-private-files`; and
 * (2) flattening lets the font CSS's `url(../font/…)` resolve directly under
 * the main static mount, so no path-rewriting route is needed. Filenames in
 * each leaf (`bpmn.css`/`bpmn.woff2`/…) are distinct, so a flat move is
 * collision-free. The proper fix belongs in the webview build's copy globs.
 */
async function flattenVendorDir(dir) {
    const nested = path.join(dir, "node_modules");
    try {
        await fsp.access(nested);
    } catch {
        return; // nothing copied under node_modules for this webview kind
    }
    for (const file of await collectFiles(nested)) {
        await fsp.copyFile(file, path.join(dir, path.basename(file)));
    }
    await fsp.rm(nested, { recursive: true, force: true });
}

async function main() {
    const cliRoot = path.resolve(__dirname, "..");
    const repoRoot = path.resolve(cliRoot, "..", "..");
    const stagingRoot = path.join(repoRoot, "dist", "webview-staging");
    const targets = ["bpmn-webview", "dmn-webview"];

    for (const name of targets) {
        const src = path.join(stagingRoot, name);
        const dest = path.join(cliRoot, "dist", "webviews", name);
        try {
            await fsp.access(src, constants.R_OK);
        } catch {
            throw new Error(
                `Missing webview build output: ${src}. ` +
                    `Run 'yarn build:${name}' (or the full 'yarn build') before building the CLI.`,
            );
        }
        await copyDir(src, dest);
        await flattenVendorDir(path.join(dest, "css"));
        await flattenVendorDir(path.join(dest, "font"));
        console.log(`[copy-webviews] ${name} -> ${path.relative(cliRoot, dest)}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
