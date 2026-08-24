import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/vscode-plugin",
            "apps/modeler-bridge",
            "apps/bpmn-webview",
            "apps/form-webview",
            "libs/append-menu",
            "libs/bpmn-i18n",
            "libs/element-template-chooser",
            "libs/modeler-core",
            "libs/model-navigation",
            "libs/shared",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
