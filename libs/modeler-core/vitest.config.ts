import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
    test: {
        name: "modeler-core",
        environment: "node",
        // archunit's vitest adapter extends `expect` on import; it needs the
        // global `expect` to exist, so enable Vitest's globals for this project.
        globals: true,
        include: ["src/**/*.{spec,test}.ts"],
        // `@miragon/bpmnlint-plugin-rules`' pre-built ESM has one extensionless deep
        // import (`bpmnlint/lib/resolver/static-resolver`) that strict native
        // Node ESM rejects. Inlining routes it through Vite's resolver — the same
        // lenient resolution webpack (VS Code) and Bun (bridge) already apply — so
        // the tests exercise the real bundler path. (Upstream should ship the
        // extension; see the migration notes.)
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: {
            // Engine specs import message classes from the shared package; resolve
            // it to source so it works without a prior build. `vscode` needs no
            // alias — the specs that touch it `vi.mock("vscode")`, which
            // short-circuits resolution.
            "@miragon/bpmn-modeler-shared": resolve(__dirname, "../shared/src/index.ts"),
        },
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/libs/modeler-core",
            reporter: ["text", "html", "lcov", "clover", "json", "json-summary"],
            // The host-agnostic domain/service core carries the most logic and is
            // the cheapest to test against in-memory port stubs, so it stays
            // near-total. These tiers moved here verbatim from the plugin when the
            // engine was extracted. Thresholds sit a few points below the measured
            // values to lock coverage in without breaking on minor churn.
            thresholds: {
                "**/domain/**": { statements: 92, branches: 82, functions: 88, lines: 92 },
                "**/service/**": { statements: 88, branches: 76, functions: 80, lines: 88 },
            },
        },
    },
});
