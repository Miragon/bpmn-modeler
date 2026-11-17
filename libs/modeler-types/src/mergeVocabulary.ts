// Typed as the home types, not `as const`: the published packages' declaration
// roll-up fails on a public type derived from a const list.

/** The two sides a merge decides between: Git's stage 2 (current) and stage 3 (incoming). */
export type MergeSide = "current" | "incoming";

export const MERGE_SIDES: readonly MergeSide[] = ["current", "incoming"];

/** What a merge pane marks on an element of its canvas. */
export type MergeMarker = "takenFromThisSide" | "takenFromOtherSide" | "conflict";

export const MERGE_MARKERS: readonly MergeMarker[] = [
    "takenFromThisSide",
    "takenFromOtherSide",
    "conflict",
];

/** The canvas marker, and CSS class, of one merge marker. */
export type MergeMarkerClass =
    "merge-taken-from-this-side" | "merge-taken-from-other-side" | "merge-conflict";

export const MERGE_MARKER_CLASSES: Readonly<Record<MergeMarker, MergeMarkerClass>> = {
    takenFromThisSide: "merge-taken-from-this-side",
    takenFromOtherSide: "merge-taken-from-other-side",
    conflict: "merge-conflict",
};

/**
 * What a side is to the user, which the Git operation decides: during a
 * rebase the incoming side is the user's own commit.
 */
export type MergeCaptionRole = "branch" | "upstream" | "yourCommit" | "stash" | "unknown";

export const MERGE_CAPTION_ROLES: readonly MergeCaptionRole[] = [
    "branch",
    "upstream",
    "yourCommit",
    "stash",
    "unknown",
];

/** A merge pane's caption as data; the webview composes the translated words. */
export interface MergeSideCaption {
    readonly side: MergeSide;
    readonly role: MergeCaptionRole;
    readonly ref?: string;
    readonly shortHash?: string;
    readonly subject?: string;
}
