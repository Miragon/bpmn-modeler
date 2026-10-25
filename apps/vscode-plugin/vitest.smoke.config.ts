import { defineConfig } from "vitest/config";

// Not a `vitest.config.ts`, so neither the root multi-project run nor this
// workspace's coverage-gated `test` picks up the real-VS-Code smoke test.
export default defineConfig({
    test: {
        name: "vscode-smoke",
        environment: "node",
        include: ["test/smoke/**/*.test.ts"],
        // The steps share one VS Code window and run in order.
        sequence: { concurrent: false },
        fileParallelism: false,
        testTimeout: 60_000,
        // Packing the VSIX and the first VS Code download (about 350 MB).
        hookTimeout: 600_000,
    },
});
