import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "apps/*/vitest.config.ts",
            "libs/*/vitest.config.ts",
            "packages/*/vitest.config.ts",
            "tools/*/vitest.config.ts",
            // An aggregator of the two projects below, which nest no further.
            "!packages/bpmn-modeler/vitest.config.ts",
            "packages/bpmn-modeler/vitest.unit.config.ts",
            "packages/bpmn-modeler/vitest.browser.config.ts",
        ],
        // Coverage options are root-only in a multi-project run, so the
        // per-workspace include/thresholds never apply here; `test:coverage`
        // runs each workspace on its own instead. Kept apart from coverage/<dir>
        // so `--coverage` here does not wipe those reports.
        coverage: {
            provider: "v8",
            reportsDirectory: "./coverage/root",
        },
    },
});
