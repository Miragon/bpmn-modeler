import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "dmn-diff",
        // Node environment (no jsdom): proves `computeDmnDiff` runs outside a browser.
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            ...coveragePreset(__dirname),
            thresholds: { statements: 98, branches: 90, functions: 98, lines: 99 },
        },
    },
});
