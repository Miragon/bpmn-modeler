#!/usr/bin/env node
/**
 * Bundles the CLI into a single self-contained CommonJS file.
 *
 * Needed because the CLI is shipped inside the IntelliJ plugin JAR and
 * extracted to a temp directory at runtime. Without bundling, Node cannot
 * resolve the runtime dependencies (express, ws, chokidar, ...) because
 * there is no `node_modules` next to the extracted entry point.
 *
 * `fsevents` is deliberately left external: it is a macOS-only optional
 * native binding for chokidar, and chokidar falls back to a polling
 * watcher when it is absent. Bundling native `.node` files does not work
 * in esbuild's JS output anyway.
 */
const { build } = require("esbuild");
const path = require("path");

async function main() {
    await build({
        entryPoints: [path.resolve(__dirname, "..", "src", "index.ts")],
        bundle: true,
        platform: "node",
        target: "node20",
        format: "cjs",
        outfile: path.resolve(__dirname, "..", "dist", "index.js"),
        // `src/index.ts` already starts with the shebang — esbuild preserves
        // it on the output, so no additional banner is needed.
        legalComments: "none",
        logLevel: "info",
        external: ["fsevents"],
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
