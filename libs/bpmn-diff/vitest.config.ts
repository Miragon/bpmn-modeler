import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-diff",
        // Node environment (no jsdom): mechanically proves `computeDiff` runs
        // outside a browser — the Node-safety acceptance criterion for #1378.
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
    },
});
