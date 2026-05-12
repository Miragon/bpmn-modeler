import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-iq-plugin",
        environment: "node",
        include: ["src/**/*.spec.ts"],
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-iq-plugin",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
