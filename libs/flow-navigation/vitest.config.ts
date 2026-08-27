import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "flow-navigation",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
