import { describe, expect, it } from "vitest";

import { COLOR_THEMES, type ColorThemeSetting } from "./settings";

// The compiler holds these keys to the union; COLOR_THEMES is only typed as it.
const EVERY_COLOR_THEME: Record<ColorThemeSetting, true> = { automatic: true, light: true };

describe("COLOR_THEMES", () => {
    it("names every colour theme once", () => {
        expect([...COLOR_THEMES].sort()).toEqual(Object.keys(EVERY_COLOR_THEME).sort());
    });
});
