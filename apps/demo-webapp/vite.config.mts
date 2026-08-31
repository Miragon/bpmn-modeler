import { resolve } from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// One app, two demo pages: `--mode bpmn` / `--mode dmn`. Each page folder is
// the Vite build root, so it emits a flat static site under dist/demo/<mode>/
// (served at /<mode>/). Because the demo builds the webview apps' source, it
// mirrors their build essentials (preact JSX, dedupe).
export default defineConfig(({ mode }) => {
    const target = mode === "dmn" ? "dmn" : "bpmn";
    return {
        root: resolve(__dirname, target),
        base: `/${target}/`,
        publicDir: resolve(__dirname, "public"),
        cacheDir: resolve(__dirname, `../../node_modules/.vite/demo-${target}`),
        plugins: [tsconfigPaths()],
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
            // The bpmn page ships extra entries — the two-instance regression
            // proof at /bpmn/dual.html and the two-pane diff demo at
            // /bpmn/diff.html. The dev server serves them automatically; only the
            // build needs the extra rollup inputs.
            rollupOptions:
                target === "bpmn"
                    ? {
                          input: {
                              index: resolve(__dirname, "bpmn/index.html"),
                              dual: resolve(__dirname, "bpmn/dual.html"),
                              diff: resolve(__dirname, "bpmn/diff.html"),
                          },
                      }
                    : undefined,
        },
        define: {
            "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
        },
        server: { allowedHosts: [".localhost"] },
    };
});
