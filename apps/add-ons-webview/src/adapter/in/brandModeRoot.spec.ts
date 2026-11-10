import { describe, expect, it } from "vitest";

import { applyBrandMode } from "./brandModeRoot";

const attributesOf = (root: HTMLElement) =>
    Object.fromEntries(root.getAttributeNames().map((name) => [name, root.getAttribute(name)]));

describe("applyBrandMode", () => {
    it.each([
        { mode: { theme: "dark" }, attributes: { "data-cd-theme": "dark" } },
        {
            mode: { theme: "light", contrast: "hoch" },
            attributes: { "data-cd-theme": "light", "data-cd-kontrast": "hoch" },
        },
    ] as const)("writes $attributes for $mode", ({ mode, attributes }) => {
        const root = document.createElement("html");

        applyBrandMode(root, mode);

        expect(attributesOf(root)).toEqual(attributes);
    });

    it("clears high contrast when the IDE leaves it", () => {
        const root = document.createElement("html");
        applyBrandMode(root, { theme: "dark", contrast: "hoch" });

        applyBrandMode(root, { theme: "dark" });

        expect(attributesOf(root)).toEqual({ "data-cd-theme": "dark" });
    });

    it("keeps the page's other attributes", () => {
        const root = document.createElement("html");
        root.setAttribute("lang", "en");

        applyBrandMode(root, { theme: "light" });

        expect(attributesOf(root)).toEqual({ "lang": "en", "data-cd-theme": "light" });
    });
});
