import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
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

/**
 * Both editor pages in one build, so the code they share ships once, in `editor/shared/`:
 * unminified and with sourcemaps, but without the libraries' comments.
 */
export default defineConfig({
    root: __dirname,
    // Chunks resolve against import.meta.url inside Orca's plugin frame.
    base: "./",
    cacheDir: "../../node_modules/.vite/orca-plugin",
    plugins: [tsconfigPaths(), evalFree()],
    oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
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
        chunkSizeWarningLimit: 10_000,
        outDir: "plugin",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                bpmn: resolve(__dirname, "editor/bpmn/index.html"),
                dmn: resolve(__dirname, "editor/dmn/index.html"),
            },
            output: {
                entryFileNames: "editor/[name]/main.js",
                comments: { legal: true, annotation: false, jsdoc: false },
                chunkFileNames: "editor/shared/[name]-[hash].js",
                assetFileNames: "editor/shared/[name]-[hash][extname]",
            },
        },
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
