import type { DiffCategory } from "./diff";

// Typed as the home type, not `as const`: the published packages' declaration
// roll-up fails on a public type derived from a const list.
/** Every diff category, in the order the diff legends show them. */
export const DIFF_CATEGORIES: readonly DiffCategory[] = [
    "added",
    "removed",
    "changed",
    "layoutChanged",
];

/** A canvas marker, and CSS class, of one diff category. */
export type DiffMarker = "diff-added" | "diff-removed" | "diff-changed" | "diff-layout-changed";

/** The canvas marker, and CSS class, a diff viewer puts on an element of each category. */
export const DIFF_MARKERS: Readonly<Record<DiffCategory, DiffMarker>> = {
    added: "diff-added",
    removed: "diff-removed",
    changed: "diff-changed",
    layoutChanged: "diff-layout-changed",
};

/** The marker on the change a diff stepper currently shows. */
export const DIFF_SELECTED_MARKER = "diff-selected";

/** The i18n keys of the words every diff legend renders. */
export interface DiffLegendTexts {
    /** The legend toolbar's accessible name. */
    readonly changes: string;
    readonly added: string;
    readonly removed: string;
    readonly changed: string;
    readonly moved: string;
    readonly previous: string;
    readonly next: string;
    readonly swap: string;
    /** Stands in for the counts when nothing changed. */
    readonly none: string;
    /** Goes back from the stepped-to change to the whole diagram. */
    readonly showAll: string;
}

export const DIFF_LEGEND_TEXTS: DiffLegendTexts = {
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
};

/** The i18n key of each side's label, shown when the pane names no file. */
export const DIFF_SIDE_TEXTS: Readonly<Record<"before" | "after", string>> = {
    before: "Old version",
    after: "New version",
};

/** The legend label key of each diff category. */
export const DIFF_CATEGORY_LABELS: Readonly<Record<DiffCategory, string>> = {
    added: DIFF_LEGEND_TEXTS.added,
    removed: DIFF_LEGEND_TEXTS.removed,
    changed: DIFF_LEGEND_TEXTS.changed,
    layoutChanged: DIFF_LEGEND_TEXTS.moved,
};
