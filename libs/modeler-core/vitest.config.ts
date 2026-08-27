import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-core",
        environment: "node",
        globals: true,
        include: ["src/**/*.{spec,test}.ts"],
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../shared/src/index.ts"),
            "@miragon/bpmn-modeler-types": resolve(__dirname, "../modeler-types/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/modeler-core",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
            thresholds: {
                "**/domain/**": { statements: 92, branches: 82, functions: 88, lines: 92 },
                "**/service/**": { statements: 88, branches: 76, functions: 80, lines: 88 },
            },
        },
    },
});
