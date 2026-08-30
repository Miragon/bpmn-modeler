import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "bpmn-modeler",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        // The rules plugin ships pure ESM with a subpath `exports` map Vitest's
        // default externalisation mishandles; inline it so the in-page linter
        // specs import it the same way the bundle does (mirrors modeler-core).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
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
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/packages/bpmn-modeler",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
