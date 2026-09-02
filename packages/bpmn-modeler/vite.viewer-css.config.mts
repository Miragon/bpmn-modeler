import { defineConfig } from "vite";
import { resolve } from "node:path";

// The readonly viewer's stylesheet ships as a standalone `dist/viewer.css`
// entry (`@miragon/bpmn-modeler/viewer.css`), because the viewer's `index.ts`
// imports no CSS: `cssCodeSplit: false` on the main lib build would otherwise
// fold any viewer-reachable sheet into `dist/bpmn-modeler.css`, dragging the
// editor chrome back in. CSS cannot be a Vite *lib* entry, so this is a separate
// CSS-only rollup (the same pattern as `vite.themes.config.mts`), but WITHOUT
// `stripThemeScope`: the viewer sheet keeps its `[data-bpmn-theme="dark"]`
// scoping so per-instance theming works. `emptyOutDir: false` so it does not
// wipe the lib build's `dist/`.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/bpmn-modeler-viewer-css",
    build: {
        target: "es2021",
        outDir: "dist",
        emptyOutDir: false,
        cssCodeSplit: true,
        rollupOptions: {
            input: {
                viewer: resolve(__dirname, "src/styles/viewer.css"),
            },
            output: {
                assetFileNames: "[name].[ext]",
            },
        },
    },
});
