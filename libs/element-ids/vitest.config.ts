import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    // The panel package has no `jsx-dev-runtime`; force the production runtime
    // so the `@jsxImportSource @bpmn-io/properties-panel/preact` pragma resolves.
    oxc: { jsx: { development: false } },
    resolve: { alias: workspaceAliases },
    test: {
        name: "element-ids",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        // The specs check generated IDs against the lint rule itself, whose
        // pre-built ESM has an extensionless deep import Vitest must inline.
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        coverage: {
            ...coveragePreset(__dirname),
            thresholds: { statements: 96, branches: 91, functions: 96, lines: 96 },
        },
    },
});
