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

export function diffStepSelection(_landing: DiffStepLanding): DiffStepSelection {
    return { kind: "clear" };
}

/** The changes only this pane's version has, as its side of the highlights lists them. */
export function changesOnlyThisSideHas(_highlights: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
}): ReadonlySet<string> {
    return new Set();
}
