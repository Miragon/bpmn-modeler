import type {
    MergePaneContainerReach,
    MergePaneSideLack,
    MergePanePickable,
    MergePaneShapelessRow,
    MergePaneStates,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types/domain";

import {
    elementPickOf,
    type MergeElementPickStates,
    type MergePadOffers,
    mergeXmlStartOf,
    ownPickOf,
} from "./mergeElementPick";
import { keepRemovedWith, type MergeKeepRemovedWith } from "./mergeKeepRemovedWith";

/** Keeps a container from `side` with everything inside, as far as the library says it reaches. */
export interface MergeKeepInside {
    readonly kind: "keep";
    readonly scope: "withContents";
    readonly side: MergeSide;
    readonly reach: MergePaneContainerReach;
}

/** One decision the context pad offers on an element the pane draws, or a menu row on a shape-less one. */
export type MergePadDecision =
    | { readonly kind: "keep"; readonly scope: "element"; readonly side: MergeSide }
    | MergeKeepInside
    /** Picks the side whose version lacks the element, which leaves it out of the result. */
    | {
          readonly kind: "leaveOut";
          readonly side: MergeSide;
          readonly lack: MergePaneSideLack;
      }
    | MergeKeepRemovedWith
    | MergeXmlDecision
    | { readonly kind: "undo"; readonly scope: MergePickScope };

/**
 * Opens the element's XML in the host's merge editor: the conflict of a
 * picked element to merge by hand, or the version merged by hand before, to
 * edit; on an element no pick decides yet, with a pick of its own.
 */
export type MergeXmlDecision =
    { readonly kind: "mergeXml"; readonly mode: "open" | "edit" } | MergeXmlWithPick;

/**
 * Merge XML on an element no pick decides yet: keeps it from `side`, the
 * pane's, then opens its conflict. Closing the editor without a save takes
 * that pick back.
 */
interface MergeXmlWithPick {
    readonly kind: "mergeXml";
    readonly mode: "keepAndOpen";
    readonly side: MergeSide;
}

/** A decision that picks or takes a pick back, which the host decides in the merge. */
export type MergePickDecision = Exclude<MergePadDecision, MergeXmlDecision>;

/** What the pad reads of the host's states. */
export type MergePadStates = Pick<MergePaneStates, "caption" | "restoreOffer"> &
    MergeElementPickStates;

/**
 * The decisions the pad offers on `elementId`, in its order: keep it from
 * the pane's side, keep a container with everything inside, leave it out
 * by picking the side that lacks it, keep what the host offers with it, merge
 * its XML by hand where the host has a merge editor, undo the user's pick.
 * An entry whose outcome the result already has is left out, so every
 * entry changes something.
 */
export function mergePadDecisions(
    states: MergePadStates,
    elementId: string,
    offers: MergePadOffers,
): readonly MergePadDecision[] {
    const pickable = states.pickable.find(({ id }) => id === elementId);
    if (pickable === undefined) return [];
    const facts: MergeDecisionFacts = {
        ...elementPickOf(states, elementId),
        takenSide: pickable.takenSide,
        lackingSide: pickable.lackingSide,
        container: pickable.container,
        restoreOffer: keepRemovedWith(states, elementId),
    };
    const paneSide = states.caption.side;
    return decisionsOn(facts, { sides: padSides(paneSide, pickable), paneSide }, offers).filter(
        (decision): decision is MergePadDecision => decision.kind !== "heldKeepInside",
    );
}

/** The pane's own side, then the side whose pick leaves the element out, where that is another. */
function padSides(paneSide: MergeSide, { lackingSide }: MergePanePickable): readonly MergeSide[] {
    return lackingSide === undefined || lackingSide.side === paneSide
        ? [paneSide]
        : [paneSide, lackingSide.side];
}

/** What a menu row reads of the host's states. */
export type MergeRowStates = Pick<MergePaneStates, "caption" | "restoreOffer">;

/** A menu row's keep with everything inside; `pressed` while the user's pick holds it, which then changes nothing. */
export type MergeRowKeepInside = MergeKeepInside & { readonly pressed?: true };

/** A menu row's decision; only a keep with everything inside can be pressed. */
export type MergeRowDecision = Exclude<MergePadDecision, MergeKeepInside> | MergeRowKeepInside;

export function keepsEverythingInside<Decision extends MergePadDecision>(
    decision: Decision,
): decision is Extract<Decision, MergeKeepInside> {
    return decision.kind === "keep" && decision.scope === "withContents";
}

/**
 * The decisions a menu row offers on a shape-less element, by the pad's
 * rule: no other pane decides it, so it offers a pick of either side, keep
 * where the side holds it, a container also with everything inside, and
 * leave out where the side lacks it, then what the host offers to keep with
 * it, Merge XML as on the pad, where a pick it makes keeps the pane's side,
 * and the undo of the user's pick. Unlike the pad's, a container's keep
 * with everything inside stays while the user's pick holds it, pressed, so
 * the row shows which reach the pick has.
 */
export function mergeRowDecisions(
    states: MergeRowStates,
    row: MergePaneShapelessRow,
    offers: MergePadOffers,
): readonly MergeRowDecision[] {
    const facts: MergeDecisionFacts = {
        ...ownPickOf(row),
        takenSide: row.takenSide,
        lackingSide: row.lackingSide,
        container: row.container,
        restoreOffer: keepRemovedWith(states, row.id),
    };
    const offeredOn = { sides: MERGE_SIDES, paneSide: states.caption.side };
    return decisionsOn(facts, offeredOn, offers).map((decision) =>
        decision.kind === "heldKeepInside" ? { ...decision.keep, pressed: true } : decision,
    );
}

/** The menu decides only a step the pad cannot reach, one no canvas draws. */
export function decidesInMenu(step: { readonly shapeless: boolean }): boolean {
    return step.shapeless;
}

/** What decides the entries offered on one element, read from the pad's states or from a menu row. */
type MergeDecisionFacts = Pick<
    MergePanePickable,
    "pick" | "takenSide" | "lackingSide" | "container" | "handMerge"
> & {
    readonly restoreOffer?: MergeKeepRemovedWith;
};

/** A keep with everything inside that the user's pick holds, so it changes nothing: the pad leaves it out, the row shows it pressed. */
interface MergeHeldKeepInside {
    readonly kind: "heldKeepInside";
    readonly keep: MergeKeepInside;
}

/** Where the entries are offered: the sides a pick can name there, and the side of the pane itself. */
interface MergeDecisionPlace {
    readonly sides: readonly MergeSide[];
    readonly paneSide: MergeSide;
}

/** The one ordered list of entries the pad and the menu row offer on `sides`; each builder leaves out an entry that would change nothing. */
function decisionsOn(
    facts: MergeDecisionFacts,
    { sides, paneSide }: MergeDecisionPlace,
    offers: MergePadOffers,
): readonly (MergePadDecision | MergeHeldKeepInside)[] {
    const decisions: (MergePadDecision | MergeHeldKeepInside | undefined)[] = [
        ...sides.flatMap((side) => [sidePick(facts, side), keepInside(facts, side)]),
        facts.restoreOffer,
        mergeXml(facts, paneSide, offers),
        facts.pick === undefined ? undefined : { kind: "undo", scope: facts.pick.scope },
    ];
    return decisions.filter((decision) => decision !== undefined);
}

/**
 * Merging the XML by hand where the host can: on the user's pick, editing it
 * once merged; on an element no pick decides yet, keeping it from the pane's
 * side first.
 */
function mergeXml(
    facts: MergeDecisionFacts,
    paneSide: MergeSide,
    offers: MergePadOffers,
): MergeXmlDecision | undefined {
    switch (mergeXmlStartOf(facts, offers)) {
        case undefined:
            return undefined;
        case "withPick":
            return { kind: "mergeXml", mode: "keepAndOpen", side: paneSide };
        case "pickedVersion":
            return { kind: "mergeXml", mode: facts.pick?.mergedByHand ? "edit" : "open" };
    }
}

/**
 * A pick of `side`: keep the element where the side holds it, unless the
 * user's pick keeps it from there already; leave it out where the side lacks
 * it, unless the result leaves it out already.
 */
function sidePick(facts: MergeDecisionFacts, side: MergeSide): MergePadDecision | undefined {
    if (facts.lackingSide?.side === side) {
        return facts.takenSide === side
            ? undefined
            : { kind: "leaveOut", side, lack: facts.lackingSide.lack };
    }
    return facts.pick?.keptSide === side ? undefined : { kind: "keep", scope: "element", side };
}

/** Keeping a container from `side` with everything inside, where the side holds it; held once the user's pick holds it. */
function keepInside(
    facts: MergeDecisionFacts,
    side: MergeSide,
): MergeKeepInside | MergeHeldKeepInside | undefined {
    const reach = facts.container;
    if (reach === undefined || facts.lackingSide?.side === side) return undefined;
    const keep: MergeKeepInside = { kind: "keep", scope: "withContents", side, reach };
    const held = facts.pick?.keptSide === side && facts.pick.scope === "withContents";
    return held ? { kind: "heldKeepInside", keep } : keep;
}
