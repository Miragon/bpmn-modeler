import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "bpmn-diff",
        // Node environment (no jsdom): mechanically proves `computeDiff` runs
        // outside a browser, its Node-safety guarantee.
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            ...coveragePreset(__dirname),
            thresholds: { statements: 93, branches: 84, functions: 97, lines: 96 },
        },
    },
});
