/** Which version of its file a diff pane shows. */
export type DiffRevision =
    | { readonly kind: "working-tree" }
    | { readonly kind: "index" }
    /** The base of a working tree change in Source Control: the index, or HEAD when nothing is staged. */
    | { readonly kind: "index-or-head" }
    | { readonly kind: "ref"; readonly ref: string }
    | { readonly kind: "unknown" };

/** One side of a diff: the URI of the file it shows and which version of it. */
export interface DiffSideVersion {
    readonly uri: string;
    readonly revision: DiffRevision;
}

// How new a version is; commits are not ranked against each other, since a ref names no ancestor.
const RECENCY: Readonly<Record<DiffRevision["kind"], number | undefined>> = {
    "ref": 0,
    "index": 1,
    "index-or-head": 1,
    "working-tree": 2,
    "unknown": undefined,
};

function isNewer(revision: DiffRevision, other: DiffRevision): boolean {
    if (revision.kind === "working-tree") return other.kind !== "working-tree";
    const rank = RECENCY[revision.kind];
    const otherRank = RECENCY[other.kind];
    return rank !== undefined && otherRank !== undefined && rank > otherRank;
}

/**
 * The sides of an SCM diff, older before newer: a commit, then the index, then
 * the working tree. Two commits, or an unknown version beside anything but the
 * working tree, keep the order their panes resolved in.
 */
export function scmSides<Pane extends { readonly revision: DiffRevision }>(
    first: Pane,
    second: Pane,
): { readonly before: Pane; readonly after: Pane } {
    return isNewer(first.revision, second.revision)
        ? { before: second, after: first }
        : { before: first, after: second };
}
