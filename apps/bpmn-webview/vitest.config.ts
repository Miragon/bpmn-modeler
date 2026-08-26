import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
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
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
