import { MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types/mergeVocabulary";

import type { MergeDecisions } from "./mergeDecisions";
import { hasNoShape } from "./mergeElementShape";
import type { ElementState, MergeElement, MergeSide } from "./mergeResult";

/** A marked element no canvas draws, which the pane lists instead. */
export interface ShapelessMark {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
}

/** What one merge pane shows of the decisions, in result order. */
export interface MergePaneView {
    /** The marker of every drawn element the pane's side holds. */
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly shapeless: readonly ShapelessMark[];
    /** Per marker, the elements the pane marks and those it lists. */
    readonly counts: Readonly<Record<MergeMarker, number>>;
}

// Both sides hold the same content, so whichever side is taken changes nothing.
const EQUAL_ON_BOTH_SIDES: ReadonlySet<ElementState> = new Set([
    "unchanged",
    "sameChange",
    "sameAddition",
]);

/**
 * The markers of a pane of `side`. An element taken from the other side
 * whose version there is absent was removed by it; the pane marks it taken
 * from the other side too.
 */
export function mergePaneView(decisions: MergeDecisions, side: MergeSide): MergePaneView {
    const marks: Record<MergeMarker, string[]> = {
        takenFromThisSide: [],
        takenFromOtherSide: [],
        conflict: [],
    };
    const shapeless: ShapelessMark[] = [];
    const marking = paneMarking(decisions);
    for (const element of decisions.result.elements) {
        const marker = marking(element, side);
        if (marker === undefined) continue;
        if (hasNoShape(element)) {
            shapeless.push({ id: element.id, type: element.type, marker });
        } else {
            marks[marker].push(element.id);
        }
    }
    const counts = Object.fromEntries(
        MERGE_MARKERS.map((marker) => [
            marker,
            marks[marker].length + shapeless.filter((entry) => entry.marker === marker).length,
        ]),
    ) as Record<MergeMarker, number>;
    return { marks, shapeless, counts };
}

/** The marker an element gets on a pane of a side, or none. */
export function paneMarking(
    decisions: MergeDecisions,
): (element: MergeElement, side: MergeSide) => MergeMarker | undefined {
    const open = new Set(decisions.openConflicts.map(({ id }) => id));
    return (element, side) => {
        if (element.versions[side] === undefined) return undefined;
        if (open.has(element.id)) return "conflict";
        const decidedSide = decisions.sideOf(element.id);
        if (decidedSide === undefined || EQUAL_ON_BOTH_SIDES.has(element.state)) return undefined;
        return decidedSide === side ? "takenFromThisSide" : "takenFromOtherSide";
    };
}
