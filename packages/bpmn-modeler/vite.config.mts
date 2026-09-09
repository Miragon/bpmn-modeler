import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "unplugin-dts/vite";

// Share the inventory with the peer guard to keep bundled libraries and runtime requirements aligned.
const inlinedLibraries = JSON.parse(
    readFileSync(new URL("./inlined-libraries.json", import.meta.url), "utf8"),
) as { name: string; sourceRoot: string }[];
const INLINED_LIBS = inlinedLibraries.map(({ name }) => name);
const INLINED_LIB_SRC = inlinedLibraries.map(({ sourceRoot }) => sourceRoot);

// Bundle descriptors as JavaScript so Node consumers do not need JSON import attributes.
const INLINED_DESCRIPTOR_JSON = new Set([
    "camunda-bpmn-moddle/resources/camunda.json",
    "zeebe-bpmn-moddle/resources/zeebe.json",
]);

function isInlined(id: string): boolean {
    return INLINED_LIBS.some((name) => id === name || id.startsWith(`${name}/`));
}

function isExternal(id: string): boolean {
    if (id.startsWith(".") || isAbsolute(id)) return false;
    if (id.endsWith(".css")) return false;
    if (isInlined(id)) return false;
    if (INLINED_DESCRIPTOR_JSON.has(id)) return false;
    // Consumers must not need a dependency on Vite's transform runtime.
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
            // Preserve package specifiers so API Extractor can resolve and inline bundled declarations.
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
        // Viewer, design, and mode CSS are built separately to avoid merging them into the editor sheet.
        cssCodeSplit: false,
        commonjsOptions: { transformMixedEsModules: true },
        chunkSizeWarningLimit: 1200,
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
                diff: resolve(__dirname, "src/diff/index.ts"),
                lint: resolve(__dirname, "src/bpmnlint/index.ts"),
                viewer: resolve(__dirname, "src/viewer/index.ts"),
                design: resolve(__dirname, "src/design/index.ts"),
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
