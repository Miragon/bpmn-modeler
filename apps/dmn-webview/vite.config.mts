/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// Asset-bundle build embedded by the VS Code / IntelliJ / desktop hosts. The
// static browser demo lives in apps/demo-webapp (which reuses this app's bootstrap()).
export default defineConfig({
    root: __dirname,
    base: "/",
    cacheDir: "../../node_modules/.vite/dmn-webview",
    plugins: [tsconfigPaths()],
    resolve: {
        // The dependency tree pulls in several CodeMirror/Lezer copies at
        // overlapping ^6 ranges (feel-editor, properties-panel, feelers, …).
        // CodeMirror identifies extensions via `instanceof` against its own
        // `@codemirror/state`, so two copies make the FEEL editor's
        // `EditorState.create` throw "Unrecognized extension value". Forcing a
        // single copy of each fixes it. Mirrors the bpmn-webview config.
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
            input: {
                index: resolve(__dirname, "src/main.ts"),
                lightTheme: resolve(__dirname, "src/styles/light-theme/index.css"),
                darkTheme: resolve(__dirname, "src/styles/dark-theme/index.css"),
            },
            output: {
                entryFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`,
            },
        },
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
    server: {
        allowedHosts: [".localhost"],
    },
});
