// The diff vocabulary types are defined in `@miragon/bpmn-modeler-diff` (the
// data layer). Re-export them type-only so existing importers (`libs/shared`,
// `modeler-core`, `host.ts`) keep resolving them from here — a type-only
// re-export carries no runtime edge, so it introduces no import cycle.
export type { DiffSide, DiffCounts } from "@miragon/bpmn-modeler-diff";

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
 * Canvas viewbox used for pan/zoom synchronisation between panes.
 */
export interface Viewport {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/**
 * A decision table's scroll position in a DMN diff pane, anchored on the
 * topmost visible rule both versions share, so the partner pane lines up the
 * same rule even when rules were added or removed above it.
 */
export interface TableScroll {
    /** The rule at the top of the view; absent when no shared rule is visible. */
    readonly rule?: string;
    /** Pixels scrolled past the top of that rule, or past the table's top without one. */
    readonly offset: number;
    readonly left: number;
}
