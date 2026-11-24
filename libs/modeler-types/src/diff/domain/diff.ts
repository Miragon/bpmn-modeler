// The diff vocabulary types are defined in `@miragon/bpmn-modeler-diff` (the
// data layer). Re-export them type-only so existing importers (`libs/shared`,
// `modeler-core`, `host.ts`) keep resolving them from here — a type-only
// re-export carries no runtime edge, so it introduces no import cycle.
export type { DiffSide, DiffCounts, DiffCategory } from "@miragon/bpmn-modeler-diff/domain";

/**
 * How a diff session was opened.
 *
 * Surfaces in the legend UI so that compare-files panes can show the origin-
 * specific affordances (filename label, swap button) that don't apply to an
 * SCM diff, where VS Code already owns the tab title and the two URIs may
 * share the same basename. `"merge"` panes show the two sides of a Git
 * conflict, `"merge-result"` panes compare a built merge with one side.
 */
export type DiffOrigin = "scm" | "compare-files" | "merge" | "merge-result";

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

/**
 * What a diff of each origin offers. Every origin rule lives here, so code
 * asks {@link diffOriginSupports} instead of comparing a {@link DiffOrigin}.
 */
export interface DiffOriginCapabilities {
    /** The panes name their files, which the tab title does not tell apart. */
    readonly namesFiles: boolean;
    /** The panes show two versions of one file, so each names the version it shows where the host tells it. */
    readonly namesVersions: boolean;
    /** The user may swap the two sides. */
    readonly swapsSides: boolean;
}

export type DiffOriginCapability = keyof DiffOriginCapabilities;

const DIFF_ORIGIN_CAPABILITIES: Record<DiffOrigin, DiffOriginCapabilities> = {
    "scm": { namesFiles: false, namesVersions: true, swapsSides: false },
    "compare-files": { namesFiles: true, namesVersions: false, swapsSides: true },
    "merge": { namesFiles: false, namesVersions: false, swapsSides: false },
    "merge-result": { namesFiles: false, namesVersions: false, swapsSides: false },
};

export function diffOriginSupports(origin: DiffOrigin, capability: DiffOriginCapability): boolean {
    return DIFF_ORIGIN_CAPABILITIES[origin][capability];
}
