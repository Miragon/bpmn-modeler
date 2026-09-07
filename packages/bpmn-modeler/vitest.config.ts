import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    // The neutral panel's forked `.tsx` files carry a per-file `@jsxImportSource
    // @bpmn-io/properties-panel/preact` pragma; that package ships no
    // `jsx-dev-runtime`, so force the production runtime (mirrors
    // libs/properties-panel/vitest.config.ts).
    oxc: { jsx: { development: false } },
    test: {
        name: "bpmn-modeler",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        // The rules plugin ships pure ESM with a subpath `exports` map Vitest's
        // default externalisation mishandles; inline it so the in-page linter
        // specs import it the same way the bundle does (mirrors modeler-core).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            // The minimap's CJS build wraps diagram-js's ESM `IdGenerator` in an
            // interop that leaves it non-constructible under Vitest's runner; the
            // ESM build imports it natively, so specs standing up a real viewer
            // (`createViewer.spec.ts`) resolve that one instead (the lib build
            // already picks `module` over `main`).
            "diagram-js-minimap": resolve(
                __dirname,
                "../../node_modules/diagram-js-minimap/dist/index.esm.js",
            ),
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
            // The i18n overlay lib has no package entry point; the mode strip's
            // default translator value-imports it, so specs that load the strip
            // need the path mapped explicitly (the lib build uses tsconfig paths).
            "@miragon/bpmn-modeler-i18n-extras": resolve(
                __dirname,
                "../../libs/bpmn-i18n-extras/src/index.ts",
            ),
            "@miragon/bpmn-modeler-diff": resolve(__dirname, "../../libs/bpmn-diff/src/index.ts"),
            // These workspace libs have no package entry point, so specs that
            // load them at runtime (capabilityModules, clipboard) need the path
            // mapped explicitly — the lib build uses vite-tsconfig-paths instead.
            "@miragon/bpmn-model-navigation": resolve(
                __dirname,
                "../../libs/model-navigation/src/index.ts",
            ),
            "@miragon/bpmn-modeler-code-link": resolve(
                __dirname,
                "../../libs/code-link/src/index.ts",
            ),
            "@miragon/bpmn-modeler-inline-scripting": resolve(
                __dirname,
                "../../libs/inline-scripting/src/index.ts",
            ),
            "@miragon/bpmn-modeler-clipboard": resolve(
                __dirname,
                "../../libs/bpmn-clipboard/src/index.ts",
            ),
            // Directory (not index.ts) so the viewer's deep imports
            // (`.../render/index` etc.) resolve through the same alias.
            "@miragon/bpmn-modeler-properties-panel": resolve(
                __dirname,
                "../../libs/properties-panel/src",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/packages/bpmn-modeler",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
