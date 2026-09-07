import { defineConfig } from "vite";
import { resolve } from "node:path";

// The two swappable theme stylesheets a consumer links via `#theme-link` (the
// permanent compatibility fallback). Scoped per-instance theming is deferred
// (#1462), so the dark sheet stays un-scoped in this step. CSS cannot be a Vite
// lib entry, so this is a separate CSS-only rollup. The output names are a
// de-facto contract — `#theme-link` swaps `lightTheme.css` ↔ `darkTheme.css` by
// name — so keep them exact.
//
// The stock `dmn-modeler.css` (`@miragon/dmn-modeler/styles.css`) is emitted by
// the separate `vite.styles.config.mts` pass: in this step `lightTheme.css` is
// byte-identical to it, and a single rollup would dedupe the two into one asset,
// dropping `dmn-modeler.css`. Two passes keep both files.
export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-modeler-themes",
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
