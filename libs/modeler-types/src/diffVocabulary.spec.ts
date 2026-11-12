import { describe, expect, expectTypeOf, it } from "vitest";

import type { DiffCategory, DiffCounts } from "./diff";
import {
    DIFF_CATEGORIES,
    DIFF_CATEGORY_LABELS,
    DIFF_LEGEND_TEXTS,
    DIFF_MARKERS,
    DIFF_SELECTED_MARKER,
} from "./diffVocabulary";

const EVERY_CATEGORY: Record<DiffCategory, true> = {
    added: true,
    removed: true,
    changed: true,
    layoutChanged: true,
};

describe("DiffCategory", () => {
    it("is a key of the diff counts", () => {
        expectTypeOf<DiffCategory>().toEqualTypeOf<keyof DiffCounts>();
        expectTypeOf<(typeof DIFF_CATEGORIES)[number]>().toEqualTypeOf<DiffCategory>();
    });
});

describe("DIFF_CATEGORIES", () => {
    it("names every category exactly once", () => {
        expect(new Set(DIFF_CATEGORIES).size).toBe(DIFF_CATEGORIES.length);
        expect([...DIFF_CATEGORIES].sort()).toEqual(Object.keys(EVERY_CATEGORY).sort());
    });

    it("lists the categories in the legend's order", () => {
        expect(DIFF_CATEGORIES).toEqual(["added", "removed", "changed", "layoutChanged"]);
    });
});

describe("DIFF_MARKERS", () => {
    it("names the canvas marker of each category", () => {
        expect(DIFF_MARKERS).toEqual({
            added: "diff-added",
            removed: "diff-removed",
            changed: "diff-changed",
            layoutChanged: "diff-layout-changed",
        });
    });

    it("keeps the selected marker apart from every category's", () => {
        expect(DIFF_SELECTED_MARKER).toBe("diff-selected");
        expect(Object.values(DIFF_MARKERS)).not.toContain(DIFF_SELECTED_MARKER);
    });
});

describe("DIFF_LEGEND_TEXTS", () => {
    it("spells the translation keys both diff legends render", () => {
        expect(DIFF_LEGEND_TEXTS).toEqual({
            changes: "Changes",
            added: "Added",
            removed: "Removed",
            changed: "Changed",
            moved: "Moved",
            previous: "Prev change",
            next: "Next change",
            swap: "Swap sides",
        });
    });
});

describe("DIFF_CATEGORY_LABELS", () => {
    it("labels a layout change as moved", () => {
        expect(DIFF_CATEGORY_LABELS).toEqual({
            added: DIFF_LEGEND_TEXTS.added,
            removed: DIFF_LEGEND_TEXTS.removed,
            changed: DIFF_LEGEND_TEXTS.changed,
            layoutChanged: DIFF_LEGEND_TEXTS.moved,
        });
    });
});
