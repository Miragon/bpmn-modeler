import type {
    MergePaneContainerReach,
    MergePaneOtherSideLack,
    MergePaneShapelessRow,
    MergePaneStates,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { MERGE_SIDES, type MergeSide, otherSide } from "@miragon/bpmn-modeler-types";

import {
    elementPickOf,
    type MergeElementPickStates,
    type MergeKeepRemovedWith,
    type MergePadOffers,
    keepRemovedWith,
    offersMergeXml,
    rowPickOf,
} from "./mergeElementPick";

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
          readonly otherSideLacks: MergePaneOtherSideLack;
      }
    | MergeKeepRemovedWith
    | MergeXmlDecision
    | { readonly kind: "undo"; readonly scope: MergePickScope };

/**
 * Opens the picked element's XML in the host's merge editor: the conflict
 * to merge by hand, or the version merged by hand before, to edit.
 */
export interface MergeXmlDecision {
    readonly kind: "mergeXml";
    readonly mode: "open" | "edit";
}

/** A decision that picks or takes a pick back, which the host decides in the merge. */
export type MergePickDecision = Exclude<MergePadDecision, MergeXmlDecision>;

/** What the pad reads of the host's states. */
export type MergePadStates = Pick<MergePaneStates, "caption" | "restoreOffer"> &
    MergeElementPickStates;

/**
 * The decisions the pad offers on `elementId`, in its order: keep it from
 * the pane's side, keep a container with everything inside, leave it out
 * where the other side lacks it, keep what the host offers with it, merge
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
    const paneSide = states.caption.side;
    const lackingSide =
        pickable.otherSideLacks === undefined
            ? undefined
            : { side: otherSide(paneSide), lack: pickable.otherSideLacks };
    const facts: MergeDecisionFacts = {
        ...elementPickOf(states, elementId),
        takenSide: pickable.takenSide,
        lackingSide,
        container: pickable.container,
        restoreOffer: keepRemovedWith(states, elementId),
    };
    const sides = lackingSide === undefined ? [paneSide] : [paneSide, lackingSide.side];
    return decisionsOn(facts, sides, offers).filter(
        (decision): decision is MergePadDecision => decision.kind !== "heldKeepInside",
    );
}

/** What a menu row reads of the host's states. */
export type MergeRowStates = Pick<MergePaneStates, "restoreOffer">;

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
 * it and the undo of the user's pick. Unlike the pad's, a container's keep
 * with everything inside stays while the user's pick holds it, pressed, so
 * the row shows which reach the pick has.
 */
export function mergeRowDecisions(
    states: MergeRowStates,
    row: MergePaneShapelessRow,
    offers: MergePadOffers,
): readonly MergeRowDecision[] {
    const facts: MergeDecisionFacts = {
        ...rowPickOf(row),
        takenSide: row.takenSide,
        lackingSide: row.lackingSide,
        container: row.container,
        restoreOffer: keepRemovedWith(states, row.id),
    };
    return decisionsOn(facts, MERGE_SIDES, offers).map((decision) =>
        decision.kind === "heldKeepInside" ? { ...decision.keep, pressed: true } : decision,
    );
}

/** The menu decides only a step the pad cannot reach, one no canvas draws. */
export function decidesInMenu(step: { readonly shapeless: boolean }): boolean {
    return step.shapeless;
}

/** What decides the entries offered on one element, read from the pad's states or from a menu row. */
type MergeDecisionFacts = Pick<
    MergePaneShapelessRow,
    "pick" | "takenSide" | "lackingSide" | "container" | "handMergeable"
> & {
    readonly restoreOffer?: MergeKeepRemovedWith;
};

/** A keep with everything inside that the user's pick holds, so it changes nothing: the pad leaves it out, the row shows it pressed. */
interface MergeHeldKeepInside {
    readonly kind: "heldKeepInside";
    readonly keep: MergeKeepInside;
}

/** The one ordered list of entries the pad and the menu row offer on `sides`; each builder leaves out an entry that would change nothing. */
function decisionsOn(
    facts: MergeDecisionFacts,
    sides: readonly MergeSide[],
    offers: MergePadOffers,
): readonly (MergePadDecision | MergeHeldKeepInside)[] {
    const decisions: (MergePadDecision | MergeHeldKeepInside | undefined)[] = [
        ...sides.flatMap((side) => [sidePick(facts, side), keepInside(facts, side)]),
        facts.restoreOffer,
        mergeXml(facts, offers),
        facts.pick === undefined ? undefined : { kind: "undo", scope: facts.pick.scope },
    ];
    return decisions.filter((decision) => decision !== undefined);
}

/** Merging the XML by hand, where the host can and the pick allows it; editing it once merged. */
function mergeXml(facts: MergeDecisionFacts, offers: MergePadOffers): MergeXmlDecision | undefined {
    if (!offersMergeXml(facts, offers)) return undefined;
    return { kind: "mergeXml", mode: facts.pick?.mergedByHand ? "edit" : "open" };
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
            : { kind: "leaveOut", side, otherSideLacks: facts.lackingSide.lack };
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
