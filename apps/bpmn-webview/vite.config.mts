/// <reference types="vitest" />
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/bpmn-webview",

    plugins: [
        tsconfigPaths(),
        viteStaticCopy({
            targets: [
                {
                    src: "../../node_modules/camunda-bpmn-js/dist/assets/bpmn-font/css/**",
                    dest: "css/",
                },
                {
                    src: "../../node_modules/camunda-bpmn-js/dist/assets/bpmn-font/font/**",
                    dest: "font/",
                },
            ],
        }),
    ],

    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },

    resolve: {
        dedupe: [
            "preact",
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
        commonjsOptions: { transformMixedEsModules: true },
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/bpmn-webview",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(__dirname, "src/main.ts"),
                lightTheme: resolve(__dirname, "src/styles/light-theme/index.css"),
                darkTheme: resolve(__dirname, "src/styles/dark-theme/index.css"),
            },
            output: {
                // don't hash the name of the output file (index.js)
                entryFileNames: `[name].js`,
                assetFileNames: "[name].[ext]",
            },
        },
    },

    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
});
