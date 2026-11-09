import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "add-ons-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            // Import-time entry wiring; bootstrap.ts carries the logic.
            ...coveragePreset(__dirname, { exclude: ["src/main.ts"] }),
            thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
        },
    },
});
