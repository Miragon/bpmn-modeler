import { defineConfig } from "vite";
import { resolve } from "node:path";

import stripThemeScope from "./scripts/postcss-strip-theme-scope.mjs";

// The two legacy theme stylesheets ship as standalone CSS entries a consumer
// links via `#theme-link` (the permanent compatibility fallback for the
// authoritative `data-bpmn-theme` attribute mechanism). The dark source is
// authored scoped under `[data-bpmn-theme="dark"]`; `stripThemeScope` removes
// that scope here so the split `darkTheme.css` stays un-scoped as before (the
// light input has no attribute, so the plugin is a no-op on it). CSS cannot be a
// Vite lib entry, so this is a separate CSS-only rollup. The output names are a
// de-facto contract — `#theme-link` swaps `lightTheme.css` ↔ `darkTheme.css` by
// name — so keep them exact.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/bpmn-modeler-themes",
    css: {
        postcss: {
            plugins: [stripThemeScope()],
        },
    },
    build: {
        target: "es2021",
        outDir: "dist",
        emptyOutDir: false,
        cssCodeSplit: true,
        rollupOptions: {
            input: {
                lightTheme: resolve(__dirname, "src/styles/light-theme/index.css"),
                darkTheme: resolve(__dirname, "src/styles/dark-theme/index.css"),
            },
            output: {
                assetFileNames: "[name].[ext]",
            },
        },
    },
});
