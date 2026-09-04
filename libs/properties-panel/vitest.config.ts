import { defineConfig } from "vitest/config";

export default defineConfig({
    // Forked `.tsx` files carry a per-file `@jsxImportSource
    // @bpmn-io/properties-panel/preact` pragma so they draw with the panel's
    // vendored preact. That package has no `exports` map, so subpaths resolve by
    // filesystem — only a `jsx-runtime` folder exists, no `jsx-dev-runtime`.
    // Force the production runtime so the pragma resolves under Vitest's dev mode
    // (Vitest 4 transforms with oxc, so the flag lives here, not under esbuild).
    oxc: { jsx: { development: false } },
    test: {
        name: "properties-panel",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
    },
});
