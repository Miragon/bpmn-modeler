import { defineConfig } from "vite";
import { isAbsolute, resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "unplugin-dts/vite";

// The private workspace libs inlined into the bundle (their source is pulled in
// via the tsconfig path aliases). Everything else bare is a real dependency and
// stays external — see `external` below. Keep this list in sync with the
// `devDependencies` `workspace:*` entries and the architecture spec.
const INLINED_LIBS = [
    "@miragon/bpmn-modeler-types",
    "@miragon/bpmn-modeler-diff",
    "@miragon/bpmn-modeler-clipboard",
    "@miragon/bpmn-modeler-i18n-extras",
    "@miragon/bpmn-modeler-element-template-chooser",
    "@miragon/bpmn-modeler-append-menu",
    "@miragon/bpmn-model-navigation",
    "@miragon/bpmn-modeler-code-link",
    "@miragon/bpmn-modeler-inline-scripting",
    "@miragon/bpmn-modeler-flow-navigation",
];

// The source roots of the inlined libs — their per-file declarations must be
// emitted so api-extractor can flatten them into `dist/index.d.ts` /
// `dist/diff.d.ts` (they carry no built `types` entry of their own). Only these
// ten; globbing all of `libs/*` would drag in the engine core's declaration
// errors too.
const INLINED_LIB_SRC = [
    "../../libs/modeler-types/src",
    "../../libs/bpmn-diff/src",
    "../../libs/bpmn-clipboard/src",
    "../../libs/bpmn-i18n-extras/src",
    "../../libs/element-template-chooser/src",
    "../../libs/append-menu/src",
    "../../libs/model-navigation/src",
    "../../libs/code-link/src",
    "../../libs/inline-scripting/src",
    "../../libs/flow-navigation/src",
];

function isInlined(id: string): boolean {
    return INLINED_LIBS.some((name) => id === name || id.startsWith(`${name}/`));
}

// Bundle relatives, absolute (alias-resolved) paths, the inlined libs, and CSS;
// externalise every other bare specifier so the bpmn-io stack is never bundled.
// `@oxc-project/runtime` is Vite 8's oxc transform-helper runtime (the tslib
// analogue for its own lowering) — inline it so consumers never take a
// dependency on our build tool's internals.
function isExternal(id: string): boolean {
    if (id.startsWith(".") || isAbsolute(id)) return false;
    if (id.endsWith(".css")) return false;
    if (isInlined(id)) return false;
    if (id === "@oxc-project/runtime" || id.startsWith("@oxc-project/runtime/")) return false;
    return true;
}

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/bpmn-modeler",
    plugins: [
        tsconfigPaths(),
        dts({
            tsconfigPath: "./tsconfig.lib.json",
            include: ["src", ...INLINED_LIB_SRC],
            // Keep the `@miragon/*` specifiers in the emitted d.ts (do NOT rewrite
            // them to source `.ts` paths); api-extractor then resolves them via
            // tsconfig `paths` and inlines the ones listed in `bundledPackages`,
            // producing one self-contained `dist/index.d.ts` with only bare npm
            // externals left as imports.
            pathsToAliases: false,
            bundleTypes: {
                bundledPackages: INLINED_LIBS,
            },
        }),
    ],
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
    build: {
        target: "es2021",
        cssCodeSplit: false,
        commonjsOptions: { transformMixedEsModules: true },
        chunkSizeWarningLimit: 1200,
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
                // Data-layer subpath (`@miragon/bpmn-modeler/diff`): no CSS,
                // bpmn-js, i18n, or preact — Node-safe (check-diff-node.mjs).
                diff: resolve(__dirname, "src/diff/index.ts"),
                // Injectable lint subpath (`@miragon/bpmn-modeler/lint`, #1407):
                // the lint stack a host imports and hands in via `linting.module`,
                // so it never lands in a `linting: false` consumer's bundle. Its
                // CSS still folds into `dist/bpmn-modeler.css` (cssCodeSplit off).
                lint: resolve(__dirname, "src/bpmnlint/index.ts"),
                // Readonly viewer subpath (`@miragon/bpmn-modeler/viewer`, #1405):
                // NavigatedViewer + outline plus the browser-only diff rendering
                // primitives (#1439), none of the editor stack. It imports no CSS
                // (so `cssCodeSplit: false` cannot fold any into
                // `dist/bpmn-modeler.css`); its sheet ships as `dist/viewer.css`
                // via `vite.viewer-css.config.mts`.
                viewer: resolve(__dirname, "src/viewer/index.ts"),
                // Engine-neutral design subpath (`@miragon/bpmn-modeler/design`,
                // #1196): base bpmn-js Modeler + a plain-BPMN properties panel,
                // none of the Camunda editor stack. Like `/viewer` it imports no
                // CSS (its sheet ships as `dist/design.css` via
                // `vite.viewer-css.config.mts`); purity gated by
                // `check-design-pure-entry.mjs`.
                design: resolve(__dirname, "src/design/index.ts"),
            },
            formats: ["es"],
            cssFileName: "bpmn-modeler",
        },
        rollupOptions: {
            external: isExternal,
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "[name].[ext]",
            },
        },
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
});
