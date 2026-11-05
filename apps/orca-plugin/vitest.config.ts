import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "orca-plugin",
        environment: "jsdom",
        include: ["src/**/*.spec.ts"],
        coverage: {
            // Entries, wiring and the canvases around the modelers run in Chromium: test/e2e.
            ...coveragePreset(__dirname, {
                exclude: ["src/*.ts", "src/composition/**", "src/adapter/out/*Canvas.ts"],
            }),
            thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
        },
    },
});
