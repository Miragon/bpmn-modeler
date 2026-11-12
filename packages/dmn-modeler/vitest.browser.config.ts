import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

import { workspaceAliases } from "../../vitest.shared";

/**
 * Second project for the DMN package: the diff pane's marks select the cells
 * dmn-js renders, and its table scroll and sticky rule numbers need a real
 * layout, which jsdom lacks.
 */
export default defineConfig({
    resolve: { alias: workspaceAliases },
    test: {
        name: "dmn-modeler-browser",
        include: ["src/**/*.browser.spec.ts"],
        browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
        },
    },
});
