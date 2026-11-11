/// <reference types="vitest" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

// Asset-bundle build embedded by the VS Code / IntelliJ / desktop hosts.
export default defineConfig({
    root: __dirname,
    // Relative base: the preload helper bakes `base` into the diff chunk's dep URLs.
    // With "/" they resolve to the webview's origin root, a 404 under VS Code's
    // resource scheme that rejects the dynamic import and leaves the pane blank.
    base: "./",
    cacheDir: "../../node_modules/.vite/dmn-webview",
    plugins: [tsconfigPaths()],
    resolve: {
        dedupe: [
            "preact",
            "inferno",
            "diagram-js",
            "moddle",
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
        // The host shell links one `index.css`; the diff chunk's own sheet would load late.
        cssCodeSplit: false,
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
                // The shells link `index.css`; without CSS splitting Vite names the sheet `style.css`.
                assetFileNames: (asset) =>
                    asset.names.some((name) => name.endsWith(".css"))
                        ? "index.css"
                        : "[name].[ext]",
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
