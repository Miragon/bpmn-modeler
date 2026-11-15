import type { MergeMarker } from "@miragon/bpmn-modeler-types/mergeVocabulary";

import type { MergeDecisions } from "./mergeDecisions";
import type { ElementState, MergeElement, MergeSide } from "./mergeResult";

/** What one merge pane shows of the decisions: the marker of each element its side holds. */
export interface MergePaneView {
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
}

// Both sides hold the same content, so whichever side is taken changes nothing.
const EQUAL_ON_BOTH_SIDES: ReadonlySet<ElementState> = new Set([
    "unchanged",
    "sameChange",
    "sameAddition",
]);

/**
 * The markers of a pane of `side`, in result order. An element taken from
 * the other side whose version there is absent was removed by it; the pane
 * marks it taken from the other side too.
 */
export function mergePaneView(decisions: MergeDecisions, side: MergeSide): MergePaneView {
    const marks: Record<MergeMarker, string[]> = {
        takenFromThisSide: [],
        takenFromOtherSide: [],
        conflict: [],
    };
    const open = new Set(decisions.openConflicts.map(({ id }) => id));
    for (const element of decisions.result.elements) {
        const marker = markerOf(element, side, open.has(element.id), decisions.sideOf(element.id));
        if (marker) marks[marker].push(element.id);
    }
    return { marks };
}

function markerOf(
    element: MergeElement,
    paneSide: MergeSide,
    isOpen: boolean,
    decidedSide: MergeSide | undefined,
): MergeMarker | undefined {
    if (element.versions[paneSide] === undefined) return undefined;
    if (isOpen) return "conflict";
    if (decidedSide === undefined || EQUAL_ON_BOTH_SIDES.has(element.state)) return undefined;
    return decidedSide === paneSide ? "takenFromThisSide" : "takenFromOtherSide";
}
