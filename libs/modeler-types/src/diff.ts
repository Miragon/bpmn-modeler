/**
 * Which side of the diff a webview pane represents.
 */
export type DiffSide = "before" | "after";

/**
 * How a diff session was opened.
 *
 * Surfaces in the legend UI so that compare-files panes can show the origin-
 * specific affordances (filename label, swap button) that don't apply to an
 * SCM diff, where VS Code already owns the tab title and the two URIs may
 * share the same basename.
 */
export type DiffOrigin = "scm" | "compare-files";

/**
 * Summary counts used for the diff legend chip.
 */
export interface DiffCounts {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly layoutChanged: number;
}

/**
 * Canvas viewbox used for pan/zoom synchronisation between panes.
 */
export interface Viewport {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
