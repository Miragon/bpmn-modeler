/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-webview",
    plugins: [tsconfigPaths()],
    resolve: {
        // The dependency tree pulls in several CodeMirror/Lezer copies at
        // overlapping ^6 ranges (feel-editor, properties-panel, feelers, …).
        // CodeMirror identifies extensions via `instanceof` against its own
        // `@codemirror/state`, so two copies make the FEEL editor's
        // `EditorState.create` throw "Unrecognized extension value" — which
        // aborts the decision-table input-expression popover mid-mount (empty
        // editor, wrong position, no close-on-outside-click). Forcing a single
        // copy of each fixes it. Mirrors the bpmn-webview config.
        dedupe: [
            "preact",
            "@bpmn-io/properties-panel",
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@codemirror/autocomplete",
            "@codemirror/commands",
            "@codemirror/lint",
            "@codemirror/search",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/lr",
        ],
    },
    build: {
        target: "es2021",
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/dmn-webview",
        emptyOutDir: true,
        rollupOptions: {
            // Separate CSS entries so the light/dark stylesheets emit fixed
            // filenames the webview can hot-swap via the `#theme-link` element.
            input: {
                index: resolve(__dirname, "src/main.ts"),
                lightTheme: resolve(__dirname, "src/styles/light-theme/index.css"),
                darkTheme: resolve(__dirname, "src/styles/dark-theme/index.css"),
            },
            output: {
                // don"t hash the name of the output file (index.js)
                entryFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`,
            },
        },
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
});
