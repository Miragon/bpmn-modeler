import { MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types/mergeVocabulary";

import { handMergeableSide } from "./handMergeEligibility";
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

/** The user's pick on an element: the side it keeps, and how far it reaches, which Undo takes back. */
export interface ElementPick {
    readonly keptSide: MergeSide;
    readonly scope: PickScope;
    /** Set while a version merged by hand replaces the kept side's own. */
    readonly mergedByHand?: true;
}

/** A user's pick on a pane that draws the element: kept from this pane's side, or from the other one. */
export interface PickBadge {
    readonly id: string;
    readonly kind: "keptHere" | "replacedHere";
    readonly pick: ElementPick;
}

/** Why one side lacks an element the other holds: it removed it from the base, or there is no base version. */
type SideLack = "removed" | "missing";

/** The side that lacks an element the other holds, and why. */
export interface LackingSide {
    readonly side: MergeSide;
    readonly lack: SideLack;
}

/** An element a pick on the pane can keep from either side; naming a side whose version lacks it leaves it out. */
export interface PickableElement {
    readonly id: string;
    /** Set where something lies inside it, which a pick can keep with it: how far that reaches. */
    readonly container?: ContainerReach;
    /** The side the result takes it from where the sides differ; a side that lacks it leaves it out. Absent while it is open. */
    readonly takenSide?: MergeSide;
    /** Set while the user's pick decides it. */
    readonly pick?: ElementPick;
    /** Set where one side lacks the element, the same on both panes; a pick of that side leaves it out. */
    readonly lackingSide?: LackingSide;
    /** Set where the user's pick decides it and its three texts differ, so its version can be merged by hand. */
    readonly handMergeable?: true;
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
    /** As {@link PickableElement.lackingSide}. */
    readonly lackingSide?: LackingSide;
    /** As {@link PickableElement.pick}. */
    readonly pick?: ElementPick;
    /** As {@link PickableElement.handMergeable}. */
    readonly handMergeable?: true;
}

/** What one merge pane shows of the decisions, in result order. */
export interface MergePaneView {
    /** The marker of every drawn element the pane's side holds. */
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly shapeless: readonly ShapelessMark[];
    /** Per marker, the elements the pane marks and those it lists. */
    readonly counts: Readonly<Record<MergeMarker, number>>;
    readonly badges: readonly PickBadge[];
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
        ...paneDecisions(decisions, side, sources),
        shapelessRows: shapelessRowsOf(decisions, side, sources),
    };
}

/**
 * The user's picks, the consequences and what a pick can keep, as a pane of
 * `side` shows them. A pick is badged only where the side's version is drawn;
 * `pickable` carries every pick.
 */
function paneDecisions(
    decisions: MergeDecisions,
    side: MergeSide,
    { handMergeTexts }: ShapelessValueSources,
): Pick<MergePaneView, "badges" | "consequences" | "pickable"> {
    const { elements } = decisions.result;
    const containers = containersOf(elements);
    const badges: PickBadge[] = [];
    const consequences: string[] = [];
    const pickable: PickableElement[] = [];
    for (const element of elements) {
        const drawnHere = !hasNoShape(element) && element.versions[side]?.drawn === true;
        const pick = pickOf(decisions, containers, element);
        if (pick !== undefined && drawnHere) {
            const kind = pick.keptSide === side ? "keptHere" : "replacedHere";
            badges.push({ id: element.id, kind, pick });
        }
        if (decisions.originOf(element.id) === "consequence" && drawnHere) {
            consequences.push(element.id);
        }
        const lacking = lackingSideOf(element);
        const takenSide = takenSideOf(decisions, element);
        const reach = containers.get(element.id);
        pickable.push({
            id: element.id,
            ...(reach === undefined ? {} : { container: reach }),
            ...(takenSide === undefined ? {} : { takenSide }),
            ...(pick === undefined ? {} : { pick }),
            ...(lacking === undefined ? {} : { lackingSide: lacking }),
            ...handMergeableFlag(decisions, handMergeTexts, element.id),
        });
    }
    return { badges, consequences, pickable };
}

function handMergeableFlag(
    decisions: MergeDecisions,
    handMergeTexts: ShapelessValueSources["handMergeTexts"],
    id: string,
): { readonly handMergeable?: true } {
    return handMergeableSide(decisions, handMergeTexts, id) === undefined
        ? {}
        : { handMergeable: true };
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
                ...handMergeableFlag(decisions, sources.handMergeTexts, element.id),
                ...shapelessValuesOf(sources, element, decisions.handMergeOf(element.id)),
            },
        ];
    });
}

/** The side and scope of the user's pick on an element, or none while no pick decides it. */
function pickOf(
    decisions: MergeDecisions,
    containers: ReadonlyMap<string, ContainerReach>,
    element: MergeElement,
): ElementPick | undefined {
    const keptSide = decisions.sideOf(element.id);
    if (decisions.originOf(element.id) !== "picked" || keptSide === undefined) return undefined;
    const scope = scopeOf(decisions, containers, element, keptSide);
    return decisions.handMergeOf(element.id) === undefined
        ? { keptSide, scope }
        : { keptSide, scope, mergedByHand: true };
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

function lackingSideOf(element: MergeElement): LackingSide | undefined {
    for (const side of MERGE_SIDES) {
        const lack = whyOtherSideLacks(element, otherSide(side));
        if (lack !== undefined) return { side, lack };
    }
    return undefined;
}

function whyOtherSideLacks(element: MergeElement, holdingSide: MergeSide): SideLack | undefined {
    if (keptAgainstRemoval(element, holdingSide)) return "removed";
    return addedOnlyBy(element, holdingSide) ? "missing" : undefined;
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
