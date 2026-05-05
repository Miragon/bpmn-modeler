import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "docs",
        include: [".vitepress/**/*.{spec,test}.ts"],
    },
});
