import { defineConfig } from "vite";
import { resolve } from "node:path";

import stripThemeScope from "./scripts/postcss-strip-theme-scope.mjs";

// CSS needs a separate build because Vite library entries cannot be CSS.
// Preserve the filenames: legacy #theme-link switching depends on them.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-modeler-themes",
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
