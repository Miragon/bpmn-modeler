import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "modeler-types",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
