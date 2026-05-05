import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/modeler-plugin",
            "apps/bpmn-webview",
            "libs/bpmn-i18n",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
