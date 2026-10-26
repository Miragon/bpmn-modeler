import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "deployment-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            // Import-time entry wiring; bootstrap.ts carries the logic.
            ...coveragePreset(__dirname, { exclude: ["src/main.ts"] }),
            thresholds: { statements: 83, branches: 77, functions: 79, lines: 84 },
        },
    },
});
