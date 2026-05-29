import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-plugin",
        environment: "node",
        // archunit's vitest adapter extends `expect` on import; it needs the
        // global `expect` to exist, so enable Vitest's globals for this project.
        globals: true,
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/modeler-plugin",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
