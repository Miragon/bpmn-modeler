import { defineConfig } from "vitest/config";

import { coveragePreset, workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "repo-checks",
        environment: "node",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        coverage: coveragePreset(__dirname),
    },
});
