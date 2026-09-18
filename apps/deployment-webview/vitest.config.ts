import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "deployment-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/deployment-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
