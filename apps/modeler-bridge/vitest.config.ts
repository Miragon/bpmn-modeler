import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "modeler-bridge",
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        // `@miragon/bpmnlint-plugin-rules`' pre-built ESM has one extensionless deep
        // import (`bpmnlint/lib/resolver/static-resolver`) that strict native
        // Node ESM rejects; inline it through Vite's resolver (as webpack/Bun do).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        coverage: {
            // The stdio entry point binds process streams on import.
            ...coveragePreset(__dirname, { exclude: ["src/server.ts"] }),
            thresholds: { statements: 89, branches: 79, functions: 88, lines: 89 },
        },
    },
});
