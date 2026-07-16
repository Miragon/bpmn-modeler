import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "append-menu",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
