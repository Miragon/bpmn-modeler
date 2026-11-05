import { defineConfig } from "vitest/config";

// Not a `vitest.config.ts`, so neither the root run nor the coverage-gated
// `test` picks up the real-Orca smoke test.
export default defineConfig({
    test: {
        name: "orca-smoke",
        environment: "node",
        include: ["test/smoke/**/*.test.ts"],
        // Each document starts its own Orca; two at once would fight over the X display.
        sequence: { concurrent: false },
        fileParallelism: false,
        testTimeout: 300_000,
    },
});
