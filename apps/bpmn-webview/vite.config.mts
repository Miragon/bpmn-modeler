/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// Asset-bundle build embedded by the VS Code / IntelliJ / desktop hosts.
// The static browser demo lives in apps/demo-webapp (which reuses this app's bootstrap()).
export default defineConfig({
    root: __dirname,
    // Relative base: the preload helper bakes `base` into async-chunk dep URLs
    // (e.g. bpmnlint.css). With "/" they resolve to the host's origin root —
    // a 404 under VS Code's vscode-resource scheme, rejecting the dynamic
    // import. Relative deps resolve against import.meta.url in every host.
    base: "./",
    cacheDir: "../../node_modules/.vite/bpmn-webview",
    plugins: [tsconfigPaths()],
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
    optimizeDeps: {
        include: ["bpmnlint", "bpmn-js-bpmnlint", "@miragon/bpmnlint-plugin-rules"],
    },
    resolve: {
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
        commonjsOptions: { transformMixedEsModules: true },
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/bpmn-webview",
        emptyOutDir: true,
        rollupOptions: {
            // No separate lightTheme/darkTheme entries: theming is per-instance
            // via the package's `data-bpmn-theme` attribute, and the theme CSS is
            // folded into the main bundle through the package's `themes.css`
            // import — the host shells no longer link a `#theme-link`.
            input: {
                index: resolve(__dirname, "src/main.ts"),
            },
            output: {
                entryFileNames: `[name].js`,
                assetFileNames: "[name].[ext]",
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
