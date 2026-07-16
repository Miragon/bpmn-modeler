import { describe, expect, it } from "vitest";

import {
    initialHighlight,
    moveHorizontal,
    moveVertical,
    type NavColumns,
    type NavItem,
} from "./navigation";

/** Builds a column where every `true` marks a disabled slot. */
function col(...disabled: boolean[]): NavItem[] {
    return disabled.map((d) => ({ disabled: d }));
}

const cols = (templates: NavItem[], palette: NavItem[]): NavColumns => ({ templates, palette });

describe("initialHighlight", () => {
    it("picks the first enabled template", () => {
        expect(initialHighlight(cols(col(false, false), col(false)))).toEqual({
            column: "templates",
            index: 0,
        });
    });

    it("skips leading disabled templates", () => {
        expect(initialHighlight(cols(col(true, false), col(false)))).toEqual({
            column: "templates",
            index: 1,
        });
    });

    it("falls back to the palette when templates are empty", () => {
        expect(initialHighlight(cols(col(), col(true, false)))).toEqual({
            column: "palette",
            index: 1,
        });
    });

    it("falls back to the palette when all templates are disabled", () => {
        expect(initialHighlight(cols(col(true, true), col(false)))).toEqual({
            column: "palette",
            index: 0,
        });
    });

    it("returns null when nothing is navigable", () => {
        expect(initialHighlight(cols(col(true), col(true)))).toBeNull();
        expect(initialHighlight(cols(col(), col()))).toBeNull();
    });
});

describe("moveVertical", () => {
    it("moves down within a column", () => {
        const c = cols(col(false, false, false), col(false));
        expect(moveVertical({ column: "templates", index: 0 }, 1, c)).toEqual({
            column: "templates",
            index: 1,
        });
    });

    it("wraps around from the last item to the first", () => {
        const c = cols(col(false, false), col(false));
        expect(moveVertical({ column: "templates", index: 1 }, 1, c)).toEqual({
            column: "templates",
            index: 0,
        });
    });

    it("wraps around from the first item to the last going up", () => {
        const c = cols(col(false, false, false), col(false));
        expect(moveVertical({ column: "templates", index: 0 }, -1, c)).toEqual({
            column: "templates",
            index: 2,
        });
    });

    it("skips disabled items", () => {
        const c = cols(col(false, true, false), col(false));
        expect(moveVertical({ column: "templates", index: 0 }, 1, c)).toEqual({
            column: "templates",
            index: 2,
        });
    });

    it("stays put when every other item is disabled", () => {
        const c = cols(col(false, true, true), col(false));
        expect(moveVertical({ column: "templates", index: 0 }, 1, c)).toEqual({
            column: "templates",
            index: 0,
        });
    });
});

describe("moveHorizontal", () => {
    it("moves right from templates into the palette", () => {
        const c = cols(col(false, false), col(false, false));
        expect(moveHorizontal({ column: "templates", index: 1 }, 1, c)).toEqual({
            column: "palette",
            index: 1,
        });
    });

    it("moves left from the palette into templates", () => {
        const c = cols(col(false, false), col(false, false));
        expect(moveHorizontal({ column: "palette", index: 0 }, -1, c)).toEqual({
            column: "templates",
            index: 0,
        });
    });

    it("clamps the index to the target column length", () => {
        const c = cols(col(false, false, false), col(false));
        expect(moveHorizontal({ column: "templates", index: 2 }, 1, c)).toEqual({
            column: "palette",
            index: 0,
        });
    });

    it("lands on the nearest enabled item when the clamped slot is disabled", () => {
        const c = cols(col(false, false), col(true, false));
        expect(moveHorizontal({ column: "templates", index: 0 }, 1, c)).toEqual({
            column: "palette",
            index: 1,
        });
    });

    it("is a no-op when already in the target column", () => {
        const c = cols(col(false), col(false, false));
        const h = { column: "palette", index: 1 } as const;
        expect(moveHorizontal(h, 1, c)).toBe(h);
    });

    it("is a no-op when the target column is empty", () => {
        const c = cols(col(false), col());
        const h = { column: "templates", index: 0 } as const;
        expect(moveHorizontal(h, 1, c)).toBe(h);
    });

    it("is a no-op when the target column has no enabled item", () => {
        const c = cols(col(false), col(true, true));
        const h = { column: "templates", index: 0 } as const;
        expect(moveHorizontal(h, 1, c)).toBe(h);
    });
});

describe("palette-only mode", () => {
    it("starts the highlight in the palette and treats horizontal as a no-op", () => {
        const c = cols(col(), col(false, false));
        const h = initialHighlight(c);
        expect(h).toEqual({ column: "palette", index: 0 });
        // ArrowLeft targets templates, which is empty → no-op.
        expect(moveHorizontal(h!, -1, c)).toBe(h);
    });
});
