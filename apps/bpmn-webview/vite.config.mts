/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

import { modelerBundlePreset, webviewImportBudget } from "../../vite.shared";

const LAZY_SVG_TO_IMAGE_SHIM = resolve(__dirname, "src/adapter/out/lazySvgToImage.ts");
// Three webviews fetching a surface each, a merge view's two panes and an editor,
// fit in the 32 loads VS Code serves at a time for all webviews of one view type.
const MAX_FILES_PER_IMPORT = 10;
// Helpers of a few KB that every surface imports, which would each be a chunk of their own.
const SMALL_HELPERS = [
    /node_modules[\\/](?:min-dash|ids|domify|lodash|semver-compare|classnames)[\\/]/,
    /node_modules[\\/]@bpmn-io[\\/]moddle-utils[\\/]/,
    /node_modules[\\/]bpmn-js[\\/]lib[\\/]util[\\/]ModelUtil\.js$/,
    /node_modules[\\/]diagram-js[\\/]lib[\\/]util[\\/]EscapeUtil\.js$/,
];
// The Lezer runtime, the FEEL grammars and the semver parser element templates use.
const PARSERS = [
    /node_modules[\\/]@lezer[\\/](?:common|highlight|lr)[\\/]/,
    /node_modules[\\/]@bpmn-io[\\/](?:lezer-feel|lezer-feelers|semver-compat)[\\/]/,
];
const matchesAny = (patterns: RegExp[]) => (id: string) =>
    patterns.some((pattern) => pattern.test(id));

// The package exposes no deep path to the real module, so the shim's own import
// must bypass the redirect by importer rather than through an alias.
function lazySvgToImage(): Plugin {
    return {
        name: "lazy-svg-to-image",
        apply: "build",
        enforce: "pre",
        resolveId(source, importer) {
            if (source !== "@bpmn-io/svg-to-image") return null;
            if (importer?.split("?")[0] === LAZY_SVG_TO_IMAGE_SHIM) return null;
            return LAZY_SVG_TO_IMAGE_SHIM;
        },
    };
}

// Asset-bundle build embedded by the VS Code / IntelliJ / desktop hosts.
export default defineConfig({
    root: __dirname,
    // Relative base: the preload helper bakes `base` into async-chunk dep URLs
    // (e.g. bpmnlint.css). With "/" they resolve to the host's origin root —
    // a 404 under VS Code's vscode-resource scheme, rejecting the dynamic
    // import. Relative deps resolve against import.meta.url in every host.
    base: "./",
    cacheDir: "../../node_modules/.vite/bpmn-webview",
    plugins: [
        tsconfigPaths(),
        lazySvgToImage(),
        webviewImportBudget({ entry: "index.js", maxFiles: MAX_FILES_PER_IMPORT }),
    ],
    ...modelerBundlePreset,
    optimizeDeps: {
        include: ["bpmnlint", "bpmn-js-bpmnlint", "@miragon/bpmnlint-plugin-rules"],
    },
    build: {
        target: "es2021",
        commonjsOptions: { transformMixedEsModules: true },
        // Surfaces and engine stacks load as async chunks, but every host shell
        // links one `index.css`; split CSS would load late and flash unstyled.
        cssCodeSplit: false,
        // Just above the Camunda stack chunk C7 and C8 share (~1.33 MB), so growth warns.
        chunkSizeWarningLimit: 1400,
        outDir: "../../dist/webview-staging/bpmn-webview",
        emptyOutDir: true,
        rollupOptions: {
            // No separate lightTheme/darkTheme entries: theming is per-instance
            // via the package's `data-bpmn-theme` attribute, and the theme CSS is
            // folded into the main bundle through the package's `themes.css`
            // import — the host shells no longer link a `#theme-link`.
            input: {
                index: resolve(__dirname, "src/main.ts"),
                templateEditor: resolve(__dirname, "src/templateEditorMain.ts"),
            },
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: "chunks/[name]-[hash].js",
                // Fewer files per surface: a webview fetches a surface's chunks at once.
                codeSplitting: {
                    groups: [
                        { name: "helpers", test: matchesAny(SMALL_HELPERS) },
                        { name: "parsers", test: matchesAny(PARSERS) },
                    ],
                },
                // The shells link `index.css`; without CSS splitting Vite names the sheet `style.css`.
                assetFileNames: (asset) =>
                    asset.names.some((name) => name.endsWith(".css"))
                        ? "index.css"
                        : "[name].[ext]",
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
