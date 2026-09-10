import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

import { bpmnModelerTestAliases } from "./vitest.aliases";

/**
 * Second project for the modeler package: the view-state contract (delayed
 * initial fit, hidden-then-visible restore, selection clearing) only reproduces
 * against a real bpmn-js canvas and a real ResizeObserver, which jsdom lacks.
 * Coverage is intentionally off — v8-coverage-in-browser merge is not worth it here.
 */
export default defineConfig({
    oxc: { jsx: { development: false } },
    // The viewer statically imports the neutral properties panel, whose forked
    // `.tsx` files carry a `@jsxImportSource @bpmn-io/properties-panel/preact`
    // pragma. That package ships only a `jsx-runtime` folder (no dev variant),
    // so the browser dep pre-bundler must also emit the production runtime — the
    // oxc flag above only governs Vitest's own transform, not esbuild's scan.
    optimizeDeps: {
        rolldownOptions: { transform: { jsx: { development: false } } },
    },
    test: {
        name: "bpmn-modeler-browser",
        include: ["src/**/*.browser.spec.ts"],
        server: { deps: { inline: [/@miragon\/bpmnlint-plugin-rules/] } },
        alias: bpmnModelerTestAliases,
        browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
        },
    },
});
