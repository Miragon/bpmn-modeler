import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "unplugin-dts/vite";

// One shared inventory drives both bundling/declaration emission and the peer
// dependency guard. Everything else bare is a real dependency and stays
// external — see `external` below and ADR 0006.
const inlinedLibraries = JSON.parse(
    readFileSync(new URL("./inlined-libraries.json", import.meta.url), "utf8"),
) as { name: string; sourceRoot: string }[];
const INLINED_LIBS = inlinedLibraries.map(({ name }) => name);
const INLINED_LIB_SRC = inlinedLibraries.map(({ sourceRoot }) => sourceRoot);

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
                // Mode-session subpath (`@miragon/bpmn-modeler/mode`, #1447): the
                // View↔Design↔Implement session + opt-in strip, with the surface
                // factories injected by the consumer so it value-imports no
                // bpmn-js/Camunda code. Imports no CSS (its sheet ships as
                // `dist/mode.css` via `vite.viewer-css.config.mts`); purity gated
                // by `check-mode-pure-entry.mjs`.
                mode: resolve(__dirname, "src/modeSession/index.ts"),
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
