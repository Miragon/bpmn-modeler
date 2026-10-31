import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    // The panel package has no `jsx-dev-runtime`; force the production runtime
    // so the `@jsxImportSource @bpmn-io/properties-panel/preact` pragma resolves.
    oxc: { jsx: { development: false } },
    resolve: { alias: workspaceAliases },
    test: {
        name: "element-template-builder",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: {
            ...coveragePreset(__dirname),
            thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
        },
    },
});
