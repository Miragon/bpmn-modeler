import { defineConfig } from "vite";
import { resolve } from "node:path";

// CSS cannot be a Vite library entry. Build separate sheets here so the main
// library build does not merge them into the editor CSS; retain per-instance theme scoping.
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
                design: resolve(__dirname, "src/styles/design.css"),
                mode: resolve(__dirname, "src/styles/mode.css"),
            },
            output: {
                assetFileNames: "[name].[ext]",
            },
        },
    },
});
