import { defineConfig } from "vitest/config";

// The editors in Chromium, built: `test:e2e` builds plugin/ first, so the root
// `vitest run` (which picks up only vitest.config.ts) never needs a build.
export default defineConfig({
    test: {
        name: "orca-plugin-e2e",
        environment: "node",
        include: ["test/e2e/**/*.test.ts"],
        testTimeout: 60_000,
        hookTimeout: 60_000,
        fileParallelism: false,
    },
});
