/** What a diff pane knows of the change a step lands on. */
export interface DiffStepLanding {
    /** Whether this pane took the step, rather than following its partner's. */
    readonly steppedHere: boolean;
    /** Whether this pane centred the change; it anchors on a neighbour when it lacks it. */
    readonly drawnHere: boolean;
    /** Whether only this pane's version has the change, so the partner cannot draw it. */
    readonly onlyThisSideHasIt: boolean;
}

export type DiffStepSelection =
    { readonly kind: "clear" } | { readonly kind: "select"; readonly keepsInView: boolean };

/**
 * A step selects its change on each pane that draws it, as a click would. One
 * pane keeps it in view on resize, so only one scrolls: the stepping pane, or,
 * when it lacks the change, the partner that alone has it.
 */
export function diffStepSelection(landing: DiffStepLanding): DiffStepSelection {
    if (!landing.drawnHere) return { kind: "clear" };
    return { kind: "select", keepsInView: landing.steppedHere || landing.onlyThisSideHasIt };
}

/** The changes only this pane's version has, as its side of the highlights lists them. */
export function changesOnlyThisSideHas(highlights: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
}): ReadonlySet<string> {
    return new Set([...highlights.added, ...highlights.removed]);
}
