import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        // The rules plugin ships pure ESM with a subpath `exports` map Vitest's
        // default externalisation mishandles; inline it so the in-page linter
        // specs import it the same way the bundle does (mirrors modeler-core).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            // The subpath alias must precede the root key: Vite matches aliases
            // in order and the root prefix would otherwise swallow `/diff`.
            "@miragon/bpmn-modeler/diff": resolve(
                __dirname,
                "../../packages/bpmn-modeler/src/diff/index.ts",
            ),
            "@miragon/bpmn-modeler/lint": resolve(
                __dirname,
                "../../packages/bpmn-modeler/src/bpmnlint/index.ts",
            ),
            "@miragon/bpmn-modeler/viewer": resolve(
                __dirname,
                "../../packages/bpmn-modeler/src/viewer/index.ts",
            ),
            "@miragon/bpmn-modeler/design": resolve(
                __dirname,
                "../../packages/bpmn-modeler/src/design/index.ts",
            ),
            "@miragon/bpmn-modeler": resolve(__dirname, "../../packages/bpmn-modeler/src/index.ts"),
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
            "@miragon/bpmn-modeler-diff": resolve(__dirname, "../../libs/bpmn-diff/src/index.ts"),
            // These workspace libs have no package entry point, so specs that
            // import them by name (e.g. capabilityModules.spec) need the path
            // mapped explicitly — the build/dev use vite-tsconfig-paths instead.
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
            "@miragon/bpmn-modeler-i18n-extras": resolve(
                __dirname,
                "../../libs/bpmn-i18n-extras/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
