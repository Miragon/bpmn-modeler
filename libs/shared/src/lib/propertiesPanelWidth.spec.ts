import { describe, expect, it } from "vitest";

import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, restorablePanelWidth } from "./propertiesPanelWidth";

describe("restorable panel width", () => {
    it.each<[string, number | undefined, number | undefined]>([
        ["nothing saved", undefined, undefined],
        ["a corrupt entry", Number.NaN, undefined],
        ["an infinite entry", Number.POSITIVE_INFINITY, undefined],
        ["a width inside the range", 640, 640],
        ["the minimum", MIN_PANEL_WIDTH, MIN_PANEL_WIDTH],
        ["the maximum", MAX_PANEL_WIDTH, MAX_PANEL_WIDTH],
        ["a width below the minimum", MIN_PANEL_WIDTH - 1, MIN_PANEL_WIDTH],
        ["a width above the maximum", MAX_PANEL_WIDTH + 1, MAX_PANEL_WIDTH],
    ])("restores %s", (_, saved, restored) => {
        expect(restorablePanelWidth(saved)).toBe(restored);
    });
});
