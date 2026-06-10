import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/vscode-plugin",
            "apps/modeler-bridge",
            "apps/bpmn-webview",
            "libs/bpmn-i18n",
            "libs/modeler-core",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
