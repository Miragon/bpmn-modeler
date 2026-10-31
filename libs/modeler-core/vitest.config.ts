import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

// Kept apart so the coverage report action, which regex-reads the first unquoted
// `statements:` in this file, reports the global gate rather than a glob tier.
const overallThresholds = { statements: 91, branches: 86, functions: 91, lines: 92 };

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "modeler-core",
        environment: "node",
        globals: true,
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        coverage: {
            // Re-export barrel; no spec imports it.
            ...coveragePreset(__dirname, { exclude: ["src/index.ts"] }),
            thresholds: {
                ...overallThresholds,
                "**/domain/**": { statements: 94, branches: 92, functions: 96, lines: 94 },
                "**/service/**": { statements: 91, branches: 84, functions: 90, lines: 91 },
                "**/infrastructure/**": { statements: 91, branches: 85, functions: 89, lines: 92 },
            },
        },
    },
});
