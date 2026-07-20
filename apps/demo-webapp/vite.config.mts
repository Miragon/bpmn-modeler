import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

// One app, two demo pages: `--mode bpmn` / `--mode dmn`. Each page folder is
// the Vite build root, so it emits a flat static site under dist/demo/<mode>/
// (served at /<mode>/). Because the demo builds the webview apps' source, it
// mirrors their build essentials (bpmn-font assets, preact JSX, dedupe).
export default defineConfig(({ mode }) => {
    const target = mode === "dmn" ? "dmn" : "bpmn";
    return {
        root: resolve(__dirname, target),
        base: `/${target}/`,
        publicDir: resolve(__dirname, "public"),
        cacheDir: resolve(__dirname, `../../node_modules/.vite/demo-${target}`),
        plugins: [
            tsconfigPaths(),
            viteStaticCopy({
                targets: [
                    {
                        src: resolve(
                            __dirname,
                            "../../node_modules/camunda-bpmn-js/dist/assets/bpmn-font/css/**",
                        ),
                        dest: "css/",
                    },
                    {
                        src: resolve(
                            __dirname,
                            "../../node_modules/camunda-bpmn-js/dist/assets/bpmn-font/font/**",
                        ),
                        dest: "font/",
                    },
                ],
            }),
        ],
        esbuild: { jsx: "automatic", jsxImportSource: "preact" },
        optimizeDeps: { include: ["bpmnlint", "bpmn-js-bpmnlint"] },
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
            outDir: resolve(__dirname, `../../dist/demo/${target}`),
            emptyOutDir: true,
        },
        define: {
            "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
        },
        server: { allowedHosts: [".localhost"] },
    };
});
