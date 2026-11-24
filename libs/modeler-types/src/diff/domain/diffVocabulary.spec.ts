import { describe, expect, expectTypeOf, it } from "vitest";

import type { DiffCategory, DiffCounts } from "./diff";
import {
    DIFF_CATEGORIES,
    DIFF_CATEGORY_LABELS,
    DIFF_LEGEND_TEXTS,
    DIFF_MARKERS,
    DIFF_SELECTED_MARKER,
    DIFF_VIEW_KEYS,
    type DiffPaneLabelFacts,
    diffPaneLabel,
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
            none: "No changes",
            showAll: "Show all",
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

describe("DIFF_VIEW_KEYS", () => {
    it("names each key once", () => {
        expect(new Set(DIFF_VIEW_KEYS).size).toBe(DIFF_VIEW_KEYS.length);
    });
});

describe("diffPaneLabel", () => {
    const inGerman = (key: string) => (key === "Old version" ? "Alte Version" : key);

    it.each<[string, DiffPaneLabelFacts, string | undefined]>([
        [
            "names a pane that compares two files by its file",
            { side: "after", origin: "compare-files", paneFilename: "b.bpmn" },
            "b.bpmn",
        ],
        [
            "names such a pane by its file, whatever version the host tells",
            {
                side: "after",
                origin: "compare-files",
                paneFilename: "b.bpmn",
                paneVersion: "Working Tree",
            },
            "b.bpmn",
        ],
        [
            "names a Git diff's pane by its side and the version it shows",
            {
                side: "after",
                origin: "scm",
                paneFilename: "order.bpmn",
                paneVersion: "Working Tree",
            },
            "New version: Working Tree",
        ],
        [
            "translates the side and keeps the version as Git names it",
            { side: "before", origin: "scm", paneFilename: "order.bpmn", paneVersion: "HEAD" },
            "Alte Version: HEAD",
        ],
        [
            "leaves a Git diff's pane to its side where the host tells no version",
            { side: "before", origin: "scm", paneFilename: "order.bpmn" },
            undefined,
        ],
        [
            "leaves a merge pane to its bar",
            { side: "after", origin: "merge", paneFilename: "order.bpmn", paneVersion: "Index" },
            undefined,
        ],
        [
            "leaves a built merge result's pane to its comparison",
            {
                side: "after",
                origin: "merge-result",
                paneFilename: "order.bpmn",
                paneVersion: "Working Tree",
            },
            undefined,
        ],
    ])("%s", (_case, facts, expected) => {
        expect(diffPaneLabel(facts, inGerman)).toBe(expected);
    });
});
