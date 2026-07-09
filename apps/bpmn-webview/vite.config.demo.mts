/// <reference types="vitest" />
import { copyFileSync } from "fs";
import { resolve } from "path";
import { mergeConfig, type Plugin } from "vite";
import baseConfig from "./vite.config.mts";

const OUT_DIR = "../../dist/demo/bpmn-webview";

/**
 * Copies the static demo shell to the publish root as `index.html`.
 *
 * The base build has no HTML entry (hosts inject their own shell), and
 * `vite-plugin-static-copy` preserves the source's directory structure, so a
 * copy target would land at `demo/index.html`. A direct copy at `closeBundle`
 * puts it exactly where Netlify serves from.
 */
function copyDemoShell(): Plugin {
    return {
        name: "copy-demo-shell",
        closeBundle() {
            copyFileSync(
                resolve(__dirname, "demo/index.html"),
                resolve(__dirname, OUT_DIR, "index.html"),
            );
        },
    };
}

/**
 * Build variant for the standalone browser demo (Netlify).
 *
 * The regular build targets an embedding host: it runs under
 * `NODE_ENV=production`, so `getHostApi()` returns `HostApiImpl`, whose
 * constructor calls `acquireVsCodeApi()` — undefined in a plain browser, an
 * immediate crash. Forcing `process.env.NODE_ENV` to `"development"` in the
 * bundle keeps the `MockHost` path (fixed sample diagram, native clipboard),
 * exactly what `yarn serve` exercises, while `vite build` still minifies.
 */
export default mergeConfig(baseConfig, {
    plugins: [copyDemoShell()],
    build: {
        outDir: OUT_DIR,
        minify: "esbuild",
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify("development"),
    },
});
