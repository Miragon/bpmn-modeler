import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "orca-plugin",
        environment: "jsdom",
        include: ["src/**/*.spec.ts"],
        coverage: {
            ...coveragePreset(__dirname),
            thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
        },
    },
});
