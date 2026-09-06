import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "form-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            // The shared barrel reaches `@miragon/bpmn-modeler-types`, which has no
            // runtime package entry (source-only), so map it explicitly like the
            // other webviews do.
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/form-webview",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
