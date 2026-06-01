import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-plugin",
        environment: "node",
        // archunit's vitest adapter extends `expect` on import; it needs the
        // global `expect` to exist, so enable Vitest's globals for this project.
        globals: true,
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/modeler-plugin",
            // `json-summary` + `json` feed the PR coverage-comment action
            // (totals + per-file deltas); `lcov` feeds Codecov; `html`/`text`
            // are for local inspection.
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
            // Per-layer gates, tiered by how much logic each layer carries and
            // how cheaply it can be tested. domain/service hold the host-agnostic
            // core and must stay near-total; controllers mix routing with vscode
            // glue; infrastructure is thin adapter code where only a floor is
            // worth enforcing (the complex parts — Camunda REST — have their own
            // integration tests). Thresholds sit a few points below the measured
            // values so they lock coverage in without breaking on minor churn.
            // composition/ and main.ts match no glob and are intentionally
            // ungated (wiring, covered indirectly by the activation smoke test).
            thresholds: {
                "**/domain/**": { statements: 92, branches: 82, functions: 88, lines: 92 },
                "**/service/**": { statements: 88, branches: 76, functions: 80, lines: 88 },
                "**/controller/**": { statements: 78, branches: 62, functions: 70, lines: 78 },
                "**/infrastructure/**": {
                    statements: 28,
                    branches: 25,
                    functions: 25,
                    lines: 28,
                },
            },
        },
    },
});
