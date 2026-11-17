import { defineConfig } from "vitest/config";

// Not a `vitest.config.ts`, so neither the root multi-project run nor this
// workspace's coverage-gated `test` picks up the real-VS-Code smoke test.
export default defineConfig({
    test: {
        name: "vscode-smoke",
        environment: "node",
        include: ["test/smoke/**/*.smoke.test.ts"],
        // Packs the extension and resolves VS Code once for every suite of the run.
        globalSetup: ["test/smoke/support/globalSetup.ts"],
        // A suite's tests share one VS Code window and run in order; two windows
        // on one display would take the focus from each other.
        sequence: { concurrent: false },
        fileParallelism: false,
        testTimeout: 90_000,
        // The first VS Code download (about 350 MB) of a suite that resolves it itself.
        hookTimeout: 600_000,
        // As long as Playwright waits for an element; Vitest's 1 s is shorter than a save.
        expect: { poll: { timeout: 30_000, interval: 100 } },
        // A failed test runs once more in a new window. The flake reporter names it.
        retry: process.env.CI ? 1 : 0,
        reporters: [
            "default",
            ...(process.env.GITHUB_ACTIONS ? ["github-actions"] : []),
            "./test/smoke/support/flakeReporter.ts",
        ],
    },
});
