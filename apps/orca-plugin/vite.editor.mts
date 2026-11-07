import { resolve } from "node:path";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Orca's `plugin check` warns on any `eval`/`Function(` call in an editor's code,
 * and the smoke test fails on a warning. None of these runs in the editor; each
 * patch fails the build once its upstream text moved, so a bump gets looked at.
 */
const EVAL_FREE_PATCHES = [
    {
        module: /\/lodash\/_root\.js$/,
        find: "Function('return this')()",
        replace: "globalThis",
    },
    {
        // preact-markup's inline `on*` handlers, which the templates never set.
        module: /\/bpmn-js-element-templates\/dist\/index\.esm\.js$/,
        find: "p = new Function(p)",
        replace: "p = undefined",
    },
    {
        // dom-iterator's string selectors, which dmn-js never passes.
        module: /\/selection-ranges\/dist\/index\.js$/,
        find: "return new Function('node', 'Object.freeze(node); return ' + props(expr, 'node.'));",
        replace: "throw new Error('string selectors are not supported');",
    },
];

function evalFree(): Plugin {
    return {
        name: "orca-eval-free",
        enforce: "pre",
        transform(code, id) {
            const patch = EVAL_FREE_PATCHES.find(({ module }) => module.test(id));
            if (!patch) return null;
            if (!code.includes(patch.find)) {
                throw new Error(`${id} no longer holds "${patch.find}": review the patch`);
            }
            return { code: code.replace(patch.find, patch.replace), map: null };
        },
    };
}

/** One editor's bundle: unminified and with sourcemaps, but without the libraries' comments. */
export function editorConfig(editor: "bpmn" | "dmn"): UserConfig {
    return defineConfig({
        root: __dirname,
        // Chunks resolve against import.meta.url inside Orca's plugin frame.
        base: "./",
        cacheDir: `../../node_modules/.vite/orca-plugin-${editor}`,
        plugins: [tsconfigPaths(), evalFree()],
        esbuild: { jsx: "automatic", jsxImportSource: "preact" },
        resolve: {
            alias: {
                "@bpmn-io/properties-panel/preact/jsx-dev-runtime":
                    "@bpmn-io/properties-panel/preact/jsx-runtime",
            },
            dedupe: [
                "preact",
                "inferno",
                "bpmn-js",
                "diagram-js",
                "bpmn-moddle",
                "moddle",
                "bpmn-js-create-append-anything",
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
            minify: false,
            sourcemap: true,
            commonjsOptions: { transformMixedEsModules: true },
            // The editor's page links one stylesheet.
            cssCodeSplit: false,
            chunkSizeWarningLimit: 10_000,
            outDir: `plugin/editor/${editor}/dist`,
            emptyOutDir: true,
            rollupOptions: {
                input: { main: resolve(__dirname, `src/${editor}.ts`) },
                output: {
                    entryFileNames: "[name].js",
                    comments: { legal: true, annotation: false, jsdoc: false },
                    chunkFileNames: "chunks/[name]-[hash].js",
                    assetFileNames: (asset) =>
                        asset.names.some((name) => name.endsWith(".css"))
                            ? "main.css"
                            : "assets/[name]-[hash][extname]",
                },
            },
        },
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
    });
}
