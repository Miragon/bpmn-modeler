import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "standalone-extension",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/standalone-extension",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
