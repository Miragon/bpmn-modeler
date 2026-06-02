// Bundles the out-of-process modeler-core bridge into a single self-contained
// CommonJS file the IntelliJ plugin spawns with `node`. esbuild (not webpack)
// because the bridge is plain Node — no VS Code externals, no asset copying —
// and a one-file bundle is the simplest thing the Kotlin host can extract and run.
//
// The `@miragon/bpmn-modeler-shared` alias points at the TS source (the package
// ships no built `main`), matching the `tsconfig.base.json` path mapping the rest
// of the repo relies on.

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

await esbuild.build({
    entryPoints: [path.join(here, "src/host-bridge/server.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outfile: path.join(repoRoot, "dist/host-bridge/server.js"),
    alias: {
        "@miragon/bpmn-modeler-shared": path.join(repoRoot, "libs/shared/src/index.ts"),
    },
    logLevel: "info",
});
