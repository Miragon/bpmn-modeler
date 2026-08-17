import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            // The problems-panel specs pull in the shared translator at runtime;
            // resolve workspace packages to source so tests run without a prior
            // `build:libs` (the app build itself uses vite-tsconfig-paths).
            "@miragon/bpmn-modeler-i18n": resolve(__dirname, "../../libs/bpmn-i18n/src/index.ts"),
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/bpmn-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
