import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-i18n": resolve(__dirname, "../../libs/bpmn-i18n/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
