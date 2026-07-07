import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "element-template-chooser",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
