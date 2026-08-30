import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-bridge",
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        // `@miragon/bpmnlint-plugin-rules`' pre-built ESM has one extensionless deep
        // import (`bpmnlint/lib/resolver/static-resolver`) that strict native
        // Node ESM rejects; inline it through Vite's resolver (as webpack/Bun do).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        // Resolve the workspace packages to their TypeScript sources so the
        // bridge's specs run against the live core, not a stale built artifact.
        alias: {
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../../libs/shared/src/index.ts"),
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
            // modeler-core imports the diff data layer; alias it to source so
            // the bridge's specs resolve it without a built artifact.
            "@miragon/bpmn-modeler-diff": resolve(__dirname, "../../libs/bpmn-diff/src/index.ts"),
            "@miragon/bpmn-modeler-core": resolve(
                __dirname,
                "../../libs/modeler-core/src/index.ts",
            ),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/apps/modeler-bridge",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
            // Measured baseline: stmts 87, branches 77, funcs 81, lines 86.
            // Thresholds set ~4 pts below to leave room for minor drift.
            thresholds: {
                statements: 83,
                branches: 73,
                functions: 77,
                lines: 82,
            },
        },
    },
});
