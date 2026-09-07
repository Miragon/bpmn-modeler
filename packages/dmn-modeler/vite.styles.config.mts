import { defineConfig } from "vite";
import { resolve } from "node:path";

// The stock dmn-js stylesheet shipped as `@miragon/dmn-modeler/styles.css` — a
// consumer needs it to render at all. It is the same stock `@import` list that
// backs both theme entries (`src/styles/base.css`), so it is emitted from its
// own rollup pass rather than as a third input alongside the themes: in this
// step it is byte-identical to `lightTheme.css`, and a single rollup would
// dedupe the two into one asset and drop this file. #1462 folds a scoped light
// base into the lib entry the way the bpmn package does.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-modeler-styles",
    build: {
        target: "es2021",
        outDir: "dist",
        emptyOutDir: false,
        cssCodeSplit: true,
        rollupOptions: {
            input: {
                "dmn-modeler": resolve(__dirname, "src/styles/base.css"),
            },
            output: {
                assetFileNames: "[name].[ext]",
            },
        },
    },
});
