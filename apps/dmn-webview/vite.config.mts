/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// Asset-bundle build embedded by the VS Code / IntelliJ / desktop hosts. The
// static browser demo (apps/demo-webapp) consumes the @miragon/dmn-modeler
// package directly, not this app's bootstrap().
export default defineConfig({
    root: __dirname,
    base: "/",
    cacheDir: "../../node_modules/.vite/dmn-webview",
    plugins: [tsconfigPaths()],
    resolve: {
        dedupe: [
            "preact",
            "inferno",
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
            // No separate lightTheme/darkTheme entries: theming is per-instance
            // via the package's `data-dmn-theme` attribute, and the theme CSS is
            // folded into the main bundle through the package's `styles.css`
            // import — the host shells no longer link a `#theme-link`.
            input: {
                index: resolve(__dirname, "src/main.ts"),
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
