import { MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types/mergeVocabulary";

import type { MergeDecisions } from "./mergeDecisions";
import { type ContainerReach, containersOf, descendantsOf } from "./mergeDecisionsContainment";
import { hasNoShape } from "./mergeElementShape";
import {
    type ElementState,
    type MergeElement,
    type MergeSide,
    addedOnlyBy,
    MERGE_SIDES,
    otherSide,
} from "./mergeResult";
import type { PickScope } from "./pickOutcome";
import { idsRemovedWith, keptAgainstRemoval } from "./removedWith";
import {
    type ShapelessValues,
    type ShapelessValueSources,
    shapelessValuesOf,
} from "./shapelessValues";

/** A marked element no canvas draws, which the pane lists instead. */
interface ShapelessMark {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
}

export type { PickScope } from "./pickOutcome";
export type { ContainerReach } from "./mergeDecisionsContainment";

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

/** Why the other side lacks an element this side holds: it removed it from the base, or there is no base version. */
type OtherSideLack = "removed" | "missing";

/** An element a pick on the pane can keep from either side; naming a side whose version lacks it leaves it out. */
export interface PickableElement {
    readonly id: string;
    /** Set where something lies inside it, which a pick can keep with it: how far that reaches. */
    readonly container?: ContainerReach;
    /** The side the result takes it from where the sides differ; a side that lacks it leaves it out. Absent while it is open. */
    readonly takenSide?: MergeSide;
    /** Set while the user's pick decides it: what Undo takes back. */
    readonly undo?: PickScope;
    /** Set where this side holds the element and the other does not, so a pick of the other side leaves it out. */
    readonly otherSideLacks?: OtherSideLack;
}

/**
 * A shape-less element either side holds and either pane marks, as a pane's
 * menu lists it with what each side holds. Unlike {@link ShapelessMark} it
 * covers an element the pane's side lacks, so the menu can decide every
 * shape-less step.
 */
export interface ShapelessRow extends ShapelessValues {
    readonly id: string;
    readonly type: string;
    /** The marker as the pane's side names it, also where that side lacks the element. */
    readonly marker: MergeMarker;
    /** Set where something lies inside it, such as a process's elements, which a pick can keep with it: how far that reaches. */
    readonly container?: ContainerReach;
    /** As {@link PickableElement.takenSide}. */
    readonly takenSide?: MergeSide;
    /** Set where one side lacks the element: that side, and why. */
    readonly lackingSide?: { readonly side: MergeSide; readonly lack: OtherSideLack };
    /** Set while the user's pick decides it. */
    readonly pick?: { readonly keptSide: MergeSide; readonly scope: PickScope };
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
    /** What the pane's menu lists; `shapeless` and `counts` leave out what the side lacks. */
    readonly shapelessRows: readonly ShapelessRow[];
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
export function mergePaneView(
    decisions: MergeDecisions,
    side: MergeSide,
    sources: ShapelessValueSources,
): MergePaneView {
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
    return {
        marks,
        shapeless,
        counts,
        ...paneDecisions(decisions, side),
        shapelessRows: shapelessRowsOf(decisions, side, sources),
    };
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
    const badges: PickBadge[] = [];
    const picksNotDrawn: PickNotDrawn[] = [];
    const consequences: string[] = [];
    const pickable: PickableElement[] = [];
    for (const element of elements) {
        const drawnHere = !hasNoShape(element) && element.versions[side]?.drawn === true;
        const pick = pickOf(decisions, containers, element);
        if (pick !== undefined) {
            const { keptSide, scope } = pick;
            if (drawnHere) {
                const kind = keptSide === side ? "keptHere" : "replacedHere";
                badges.push({ id: element.id, kind, keptSide, scope });
            } else {
                picksNotDrawn.push({ id: element.id, keptSide, scope });
            }
        }
        if (decisions.originOf(element.id) === "consequence" && drawnHere) {
            consequences.push(element.id);
        }
        const lack = otherSideLacks(element, side);
        const takenSide = takenSideOf(decisions, element);
        const reach = containers.get(element.id);
        pickable.push({
            id: element.id,
            ...(reach === undefined ? {} : { container: reach }),
            ...(takenSide === undefined ? {} : { takenSide }),
            ...(pick === undefined ? {} : { undo: pick.scope }),
            ...(lack === undefined ? {} : { otherSideLacks: lack }),
        });
    }
    return { badges, picksNotDrawn, consequences, pickable };
}

/** Every shape-less element the decisions mark as a side sees it, with what each side holds. */
function shapelessRowsOf(
    decisions: MergeDecisions,
    side: MergeSide,
    sources: ShapelessValueSources,
): ShapelessRow[] {
    const { elements } = decisions.result;
    const containers = containersOf(elements);
    const marking = decisionMarking(decisions);
    return elements.flatMap((element): ShapelessRow[] => {
        const marker = marking(element, side);
        if (!hasNoShape(element) || marker === undefined) return [];
        const takenSide = takenSideOf(decisions, element);
        const lacking = lackingSideOf(element);
        const pick = pickOf(decisions, containers, element);
        const reach = containers.get(element.id);
        return [
            {
                id: element.id,
                type: element.type,
                marker,
                ...(reach === undefined ? {} : { container: reach }),
                ...(takenSide === undefined ? {} : { takenSide }),
                ...(lacking === undefined ? {} : { lackingSide: lacking }),
                ...(pick === undefined ? {} : { pick }),
                ...shapelessValuesOf(sources, element),
            },
        ];
    });
}

/** The side and scope of the user's pick on an element, or none while no pick decides it. */
function pickOf(
    decisions: MergeDecisions,
    containers: ReadonlyMap<string, ContainerReach>,
    element: MergeElement,
): { readonly keptSide: MergeSide; readonly scope: PickScope } | undefined {
    const keptSide = decisions.sideOf(element.id);
    return decisions.originOf(element.id) === "picked" && keptSide !== undefined
        ? { keptSide, scope: scopeOf(decisions, containers, element, keptSide) }
        : undefined;
}

// Read from the picks, never from how they were made, so every order of the same picks badges alike.
function scopeOf(
    decisions: MergeDecisions,
    containers: ReadonlyMap<string, ContainerReach>,
    element: MergeElement,
    keptSide: MergeSide,
): PickScope {
    const { elements } = decisions.result;
    const pickedOn = (id: string) =>
        decisions.originOf(id) === "picked" && decisions.sideOf(id) === keptSide;
    if (containers.has(element.id) && descendantsOf(element.id, elements).every(pickedOn)) {
        return "withContents";
    }
    if (!idsRemovedWith(elements, element, keptSide).some(pickedOn)) return "element";
    const { connections, boundaryEvents } = decisions.removedWithLeftOut(element.id, keptSide);
    return connections.length === 0 && boundaryEvents.length === 0 ? "withRemoved" : "element";
}

function lackingSideOf(element: MergeElement): ShapelessRow["lackingSide"] {
    for (const side of MERGE_SIDES) {
        const lack = otherSideLacks(element, otherSide(side));
        if (lack !== undefined) return { side, lack };
    }
    return undefined;
}

function otherSideLacks(element: MergeElement, side: MergeSide): OtherSideLack | undefined {
    if (keptAgainstRemoval(element, side)) return "removed";
    return addedOnlyBy(element, side) ? "missing" : undefined;
}

/** The marker an element gets on a pane of a side, or none; a pane marks only what its side holds. */
export function paneMarking(
    decisions: MergeDecisions,
): (element: MergeElement, side: MergeSide) => MergeMarker | undefined {
    const marking = decisionMarking(decisions);
    return (element, side) =>
        element.versions[side] === undefined ? undefined : marking(element, side);
}

/** The marker the decisions give an element as a side sees it, whether or not the side holds it. */
function decisionMarking(
    decisions: MergeDecisions,
): (element: MergeElement, side: MergeSide) => MergeMarker | undefined {
    const open = new Set(decisions.openConflicts.map(({ id }) => id));
    return (element, side) => {
        if (open.has(element.id)) return "conflict";
        const takenSide = takenSideOf(decisions, element);
        if (takenSide === undefined) return undefined;
        return takenSide === side ? "takenFromThisSide" : "takenFromOtherSide";
    };
}

/** The side the decisions take an element from, where taking the other would differ. */
function takenSideOf(decisions: MergeDecisions, element: MergeElement): MergeSide | undefined {
    return EQUAL_ON_BOTH_SIDES.has(element.state) ? undefined : decisions.sideOf(element.id);
}
