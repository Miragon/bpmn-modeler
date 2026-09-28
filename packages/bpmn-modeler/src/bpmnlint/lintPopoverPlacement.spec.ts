import { describe, expect, it } from "vitest";

import { choosePopoverPlacement } from "./lintPopoverPlacement";

const bounds = { left: 0, top: 0, right: 1000, bottom: 800 };
const popover = { width: 260, height: 80 };

function anchorAt(left: number, top: number) {
    return { left, top, right: left + 20, bottom: top + 20 };
}

describe("choosePopoverPlacement", () => {
    it("keeps the vendor default above/right when it fits", () => {
        expect(choosePopoverPlacement(anchorAt(400, 400), popover, bounds)).toEqual({
            vertical: "above",
            horizontal: "right",
        });
    });

    it("flips below when there is no room above", () => {
        expect(choosePopoverPlacement(anchorAt(400, 30), popover, bounds).vertical).toBe("below");
    });

    it("flips left when there is no room to the right", () => {
        expect(choosePopoverPlacement(anchorAt(900, 400), popover, bounds).horizontal).toBe("left");
    });

    it("stays above/right when neither side fits but the default side has more room", () => {
        const tinyBounds = { left: 0, top: 0, right: 200, bottom: 100 };

        expect(choosePopoverPlacement(anchorAt(20, 60), popover, tinyBounds)).toEqual({
            vertical: "above",
            horizontal: "right",
        });
    });
});
