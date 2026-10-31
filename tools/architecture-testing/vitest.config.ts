import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "architecture-testing",
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            ...coveragePreset(__dirname, { exclude: ["src/index.ts"] }),
            thresholds: { statements: 100, branches: 97, functions: 100, lines: 100 },
        },
    },
});
