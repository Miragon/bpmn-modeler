import { defineConfig } from "vite";
import { resolve } from "node:path";

import stripThemeScope from "./scripts/postcss-strip-theme-scope.mjs";

// CSS cannot be a Vite library entry, so legacy theme sheets need a separate build.
// Strip dark scoping for page-global links; preserve filenames used by #theme-link swaps.
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
