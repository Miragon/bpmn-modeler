/// <reference types="vitest" />
import { resolve } from "node:path";

import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    root: __dirname,
    base: "/",
    cacheDir: "../../node_modules/.vite/form-webview",
    plugins: [tsconfigPaths()],
    resolve: {
        // CodeMirror extension values require one shared state module instance.
        dedupe: ["preact", "@codemirror/state"],
    },
    build: {
        target: "es2021",
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/form-webview",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(__dirname, "src/main.ts"),
                styles: resolve(__dirname, "src/styles/index.css"),
            },
            output: {
                entryFileNames: "[name].js",
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
