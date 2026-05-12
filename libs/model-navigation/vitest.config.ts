import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "context-pad-navigate",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(
                __dirname,
                "../../libs/shared/src/index.ts",
            ),
        },
    },
});
