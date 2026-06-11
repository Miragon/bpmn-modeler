import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "shared",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/shared",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
        },
    },
});
