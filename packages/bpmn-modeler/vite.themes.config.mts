import { defineConfig } from "vite";
import { resolve } from "node:path";

// The two theme stylesheets ship as standalone CSS entries a consumer links
// (or that the modeler's "automatic" theme swaps via `#theme-link`). CSS cannot
// be a Vite lib entry, so this is a separate CSS-only rollup. The output names
// are a de-facto contract: `libs/modeler-types/theme.ts` swaps `lightTheme.css`
// ↔ `darkTheme.css` by regex, so keep them exact.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/bpmn-modeler-themes",
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
