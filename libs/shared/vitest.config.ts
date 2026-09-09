import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "shared",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-types": resolve(__dirname, "../modeler-types/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/shared",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
        },
    },
});
