import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "shared",
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            ...coveragePreset(__dirname, {
                // DEV-only i18n harvest harness; no shipped build wires it in.
                exclude: ["src/lib/harvestRecorder.ts"],
            }),
            thresholds: { statements: 93, branches: 84, functions: 95, lines: 94 },
        },
    },
});
