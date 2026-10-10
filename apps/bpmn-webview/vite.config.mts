/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

const LAZY_SVG_TO_IMAGE_SHIM = resolve(__dirname, "src/lazySvgToImage.ts");

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
    plugins: [tsconfigPaths(), lazySvgToImage()],
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "preact",
    },
    optimizeDeps: {
        include: ["bpmnlint", "bpmn-js-bpmnlint", "@miragon/bpmnlint-plugin-rules"],
    },
    resolve: {
        dedupe: [
            "preact",
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
            },
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: "chunks/[name]-[hash].js",
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
