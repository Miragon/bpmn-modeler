/// <reference types="vitest" />
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-webview",

    plugins: [
        tsconfigPaths(),
        viteStaticCopy({
            targets: [
                {
                    src: "../../node_modules/dmn-js/dist/assets/dmn-font/css/**",
                    dest: "css/",
                },
                {
                    src: "../../node_modules/dmn-js/dist/assets/dmn-font/font/**",
                    dest: "font/",
                },
            ],
        }),
    ],

    build: {
        target: "es2021",
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/dmn-webview",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                // don"t hash the name of the output file (index.js)
                entryFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`,
            },
        },
    },

    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
});
