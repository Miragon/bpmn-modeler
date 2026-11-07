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
        // `orca plugin shot --act` clicks two animation frames after the editor asks for its
        // document, which is often before the BPMN modeler has rendered, and its capture now and
        // then loses the BPMN frame ("Object has been destroyed"). Each attempt starts a fresh Orca.
        retry: 2,
    },
});
