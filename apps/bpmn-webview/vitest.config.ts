import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: {
        alias: [
            ...workspaceAliases,
            // As in vite.config.mts: the panel's vendored preact has no jsx-dev-runtime.
            {
                find: "@bpmn-io/properties-panel/preact/jsx-dev-runtime",
                replacement: "@bpmn-io/properties-panel/preact/jsx-runtime",
            },
        ],
    },
    test: {
        name: "bpmn-webview",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        // The rules plugin ships pure ESM with a subpath `exports` map Vitest's
        // default externalisation mishandles; inline it so the in-page linter
        // specs import it the same way the bundle does (mirrors modeler-core).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        coverage: {
            // Import-time entry wiring and a re-export barrel without logic of their own.
            ...coveragePreset(__dirname, {
                exclude: ["src/main.ts", "src/templateEditor/main.ts", "src/index.ts"],
            }),
            thresholds: { statements: 93, branches: 91, functions: 92, lines: 95 },
        },
    },
});
