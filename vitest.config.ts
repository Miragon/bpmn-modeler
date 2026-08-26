import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/vscode-plugin",
            "apps/modeler-bridge",
            "apps/bpmn-webview",
            "libs/append-menu",
            "libs/bpmn-i18n-extras",
            "libs/code-link",
            "libs/element-template-chooser",
            "libs/inline-scripting",
            "libs/modeler-core",
            "libs/modeler-types",
            "libs/shared",
            "libs/flow-navigation",
            "libs/model-navigation",
        ],
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
