import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "vscode-plugin",
        environment: "node",
        // archunit's vitest adapter extends `expect` on import; it needs the
        // global `expect` to exist, so enable Vitest's globals for this project.
        globals: true,
        include: ["src/**/*.{spec,test}.ts"],
        // `@miragon/bpmnlint-plugin-rules`' pre-built ESM has one extensionless deep
        // import (`bpmnlint/lib/resolver/static-resolver`) that strict native
        // Node ESM rejects; inline it through Vite's resolver (as webpack/Bun do).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
            "@miragon/bpmn-modeler-core": resolve(
                __dirname,
                "../../libs/modeler-core/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/vscode-plugin",
            // `json-summary` + `json` feed the PR coverage-comment action
            // (totals + per-file deltas); `lcov` feeds Codecov; `html`/`text`
            // are for local inspection.
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
            // Per-layer gates, tiered by how much logic each layer carries and
            // how cheaply it can be tested. The host-agnostic domain/service core
            // moved to `@miragon/bpmn-modeler-core` and is gated there; what
            // remains here is host code — controllers mix routing with vscode
            // glue; infrastructure is thin adapter code where only a floor is
            // worth enforcing (the complex parts — Camunda REST — have their own
            // integration tests). Thresholds sit a few points below the measured
            // values so they lock coverage in without breaking on minor churn.
            // composition/ and main.ts match no glob and are intentionally
            // ungated (wiring, covered indirectly by the activation smoke test).
            thresholds: {
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
