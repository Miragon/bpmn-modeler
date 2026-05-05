import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-i18n",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/bpmn-i18n",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
