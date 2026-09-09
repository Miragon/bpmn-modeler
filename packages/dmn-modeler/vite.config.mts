import { defineConfig } from "vite";
import { isAbsolute, resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import dts from "unplugin-dts/vite";

// Private workspace libraries must be inlined because consumers cannot install them.
const INLINED_LIBS = ["@miragon/bpmn-modeler-types", "@miragon/bpmn-modeler-i18n-extras"];

// Emit private-library declarations so API Extractor can inline their types.
const INLINED_LIB_SRC = ["../../libs/modeler-types/src", "../../libs/bpmn-i18n-extras/src"];

function isInlined(id: string): boolean {
    return INLINED_LIBS.some((name) => id === name || id.startsWith(`${name}/`));
}

function isExternal(id: string): boolean {
    if (id.startsWith(".") || isAbsolute(id)) return false;
    if (id.endsWith(".css")) return false;
    if (isInlined(id)) return false;
    // Inline transform helpers to avoid exposing a build-tool dependency.
    if (id === "@oxc-project/runtime" || id.startsWith("@oxc-project/runtime/")) return false;
    return true;
}

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/dmn-modeler",
    plugins: [
        tsconfigPaths(),
        dts({
            tsconfigPath: "./tsconfig.lib.json",
            include: ["src", ...INLINED_LIB_SRC],
            // API Extractor needs package specifiers to resolve and inline bundledPackages.
            pathsToAliases: false,
            bundleTypes: {
                bundledPackages: INLINED_LIBS,
            },
        }),
    ],
    build: {
        target: "es2021",
        cssCodeSplit: false,
        commonjsOptions: { transformMixedEsModules: true },
        chunkSizeWarningLimit: 1200,
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
            },
            formats: ["es"],
            cssFileName: "dmn-modeler",
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
