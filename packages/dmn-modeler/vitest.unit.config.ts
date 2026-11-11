import { defineConfig } from "vitest/config";

import { workspaceAliases } from "../../vitest.shared";

export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "dmn-modeler",
        environment: "jsdom",
        include: ["src/**/*.{spec,test}.{ts,tsx}"],
        // The browser project owns the specs that need a real layout and real dmn-js rendering.
        exclude: ["src/**/*.browser.spec.ts", "node_modules/**", "dist/**"],
    },
});
