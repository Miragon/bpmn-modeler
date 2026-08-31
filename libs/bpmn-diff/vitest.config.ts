import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-diff",
        // Node environment (no jsdom): mechanically proves `computeDiff` runs
        // outside a browser, its Node-safety guarantee.
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
