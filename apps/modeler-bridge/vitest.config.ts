import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-bridge",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        // Resolve the workspace packages to their TypeScript sources so the
        // bridge's specs run against the live core, not a stale built artifact.
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            "@miragon/bpmn-modeler-core": resolve(
                __dirname,
                "../../libs/modeler-core/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/modeler-bridge",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
        },
    },
});
