import { defineConfig } from "vitest/config";

import { bpmnModelerTestAliases } from "./vitest.aliases";

export default defineConfig({
    // The neutral panel's forked `.tsx` files carry a per-file `@jsxImportSource
    // @bpmn-io/properties-panel/preact` pragma; that package ships no
    // `jsx-dev-runtime`, so force the production runtime (mirrors
    // libs/properties-panel/vitest.config.ts).
    oxc: { jsx: { development: false } },
    test: {
        name: "bpmn-modeler",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.ts"],
        // The browser project owns the real-ResizeObserver specs; jsdom ships no
        // ResizeObserver, so keep them out of this project.
        exclude: ["src/**/*.browser.spec.ts", "node_modules/**", "dist/**"],
        // The rules plugin ships pure ESM with a subpath `exports` map Vitest's
        // default externalisation mishandles; inline it so the in-page linter
        // specs import it the same way the bundle does (mirrors modeler-core).
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: bpmnModelerTestAliases,
        coverage: {
            provider: "v8",
            reportsDirectory: "../../coverage/packages/bpmn-modeler",
            reporter: ["text", "html", "lcov", "clover", "json"],
        },
    },
});
