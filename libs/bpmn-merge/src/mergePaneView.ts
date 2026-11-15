import { MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types/mergeVocabulary";

import type { MergeDecisions } from "./mergeDecisions";
import { containersOf, descendantsOf } from "./mergeDecisionsContainment";
import { hasNoShape } from "./mergeElementShape";
import type { ElementState, MergeElement, MergeSide } from "./mergeResult";
import { connectionsRemovedWith } from "./removedConnections";

/** A marked element no canvas draws, which the pane lists instead. */
export interface ShapelessMark {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
}

/** How a user's pick was made, and so what Undo takes back with it. */
export type PickScope = "element" | "withContents" | "withConnections";

/** A user's pick on a pane that draws the element: kept from this pane's side, or from the other one. */
export interface PickBadge {
    readonly id: string;
    readonly kind: "keptHere" | "replacedHere";
    readonly keptSide: MergeSide;
    readonly scope: PickScope;
}

/** A user's pick the pane cannot draw, which its legend lists instead. */
export interface PickNotDrawn {
    readonly id: string;
    readonly keptSide: MergeSide;
    readonly scope: PickScope;
}

/** An element a pick on the pane keeps from its side, or keeps out where the side removed it. */
export interface PickableElement {
    readonly id: string;
    /** Something lies inside it, which a pick can keep with it. */
    readonly container: boolean;
    /** Set while the user's pick decides it: what Undo takes back. */
    readonly undo?: PickScope;
}

/** What one merge pane shows of the decisions, in result order. */
export interface MergePaneView {
    /** The marker of every drawn element the pane's side holds. */
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly shapeless: readonly ShapelessMark[];
    /** Per marker, the elements the pane marks and those it lists. */
    readonly counts: Readonly<Record<MergeMarker, number>>;
    readonly badges: readonly PickBadge[];
    readonly picksNotDrawn: readonly PickNotDrawn[];
    /** The drawn elements a pick pulled in or dropped. */
    readonly consequences: readonly string[];
    readonly pickable: readonly PickableElement[];
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
    return { marks, shapeless, counts, ...paneDecisions(decisions, side) };
}

/**
 * The user's picks, the consequences and what a pick can keep, as a pane of
 * `side` shows them. A pick counts as drawn only where the side's version is
 * drawn, so a pane that cannot badge it lists it.
 */
function paneDecisions(
    decisions: MergeDecisions,
    side: MergeSide,
): Pick<MergePaneView, "badges" | "picksNotDrawn" | "consequences" | "pickable"> {
    const { elements } = decisions.result;
    const containers = containersOf(elements);
    const pickedOn = (id: string, pickSide: MergeSide) =>
        decisions.originOf(id) === "picked" && decisions.sideOf(id) === pickSide;
    // Read from the picks, never from how they were made, so every order of the same picks badges alike.
    const scopeOf = (element: MergeElement, keptSide: MergeSide): PickScope => {
        if (
            containers.has(element.id) &&
            descendantsOf(element.id, elements).every((id) => pickedOn(id, keptSide))
        ) {
            return "withContents";
        }
        const keptWithFlows =
            connectionsRemovedWith(elements, element, keptSide).some(({ id }) =>
                pickedOn(id, keptSide),
            ) && decisions.connectionsLeftOut(element.id, keptSide).length === 0;
        return keptWithFlows ? "withConnections" : "element";
    };
    const badges: PickBadge[] = [];
    const picksNotDrawn: PickNotDrawn[] = [];
    const consequences: string[] = [];
    const pickable: PickableElement[] = [];
    for (const element of elements) {
        const origin = decisions.originOf(element.id);
        const drawnHere = !hasNoShape(element) && element.versions[side]?.drawn === true;
        const keptSide = decisions.sideOf(element.id);
        const scope =
            origin === "picked" && keptSide !== undefined ? scopeOf(element, keptSide) : undefined;
        if (scope !== undefined && keptSide !== undefined) {
            if (drawnHere) {
                const kind = keptSide === side ? "keptHere" : "replacedHere";
                badges.push({ id: element.id, kind, keptSide, scope });
            } else {
                picksNotDrawn.push({ id: element.id, keptSide, scope });
            }
        }
        if (origin === "consequence" && drawnHere) consequences.push(element.id);
        const container = containers.has(element.id);
        pickable.push(
            scope === undefined
                ? { id: element.id, container }
                : { id: element.id, container, undo: scope },
        );
    }
    return { badges, picksNotDrawn, consequences, pickable };
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
