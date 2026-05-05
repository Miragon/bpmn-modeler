import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
