import {
    type MergeHostOffers,
    type MergePaneContainerReach,
    type MergePaneOtherSideLack,
    type MergePaneRestoreOffer,
    type MergePaneShapelessRow,
    type MergePaneStates,
    type MergePickScope,
    NO_MERGE_HOST_OFFERS,
} from "@miragon/bpmn-modeler-shared";
import { MERGE_SIDES, type MergeSide, otherSide } from "@miragon/bpmn-modeler-types";

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
    /** Picks the element again with the flows and boundary events `offer` names. */
    | {
          readonly kind: "keepRemovedWith";
          readonly side: MergeSide;
          readonly offer: MergePaneRestoreOffer;
      }
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

/** What the decisions read of what the host offers besides them. */
export type MergePadOffers = Pick<MergeHostOffers, "elementXmlMerge">;

/** What the pad reads of the host's states. */
export type MergePadStates = Pick<
    MergePaneStates,
    "caption" | "pickable" | "badges" | "restoreOffer"
>;

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
    offers: MergePadOffers = NO_MERGE_HOST_OFFERS,
): readonly MergePadDecision[] {
    const pickable = states.pickable.find(({ id }) => id === elementId);
    if (pickable === undefined) return [];
    const paneSide = states.caption.side;
    const badge = states.badges.find(({ id }) => id === elementId);
    const facts: SidePickFacts = {
        pickedSide: badge?.keptSide,
        takenSide: pickable.takenSide,
        lacking:
            pickable.otherSideLacks === undefined
                ? undefined
                : { side: otherSide(paneSide), lack: pickable.otherSideLacks },
    };
    const keptHere = badge?.keptSide === paneSide ? badge.scope : undefined;
    const decisions: (MergePadDecision | undefined)[] = [
        sidePick(facts, paneSide),
        pickable.container !== undefined && keptHere !== "withContents"
            ? { kind: "keep", scope: "withContents", side: paneSide, reach: pickable.container }
            : undefined,
        facts.lacking === undefined ? undefined : sidePick(facts, facts.lacking.side),
        keepRemovedWith(states, elementId),
        mergeXml(pickable, badge, offers),
        pickable.undo === undefined ? undefined : { kind: "undo", scope: pickable.undo },
    ];
    return decisions.filter((decision) => decision !== undefined);
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
    offers: MergePadOffers = NO_MERGE_HOST_OFFERS,
): readonly MergeRowDecision[] {
    const facts: SidePickFacts = {
        pickedSide: row.pick?.keptSide,
        takenSide: row.takenSide,
        lacking: row.lackingSide,
    };
    const keptWithContentsFrom = row.pick?.scope === "withContents" ? row.pick.keptSide : undefined;
    const reach = row.container;
    const withContents = (side: MergeSide): MergeRowKeepInside | undefined =>
        reach !== undefined && row.lackingSide?.side !== side
            ? {
                  kind: "keep",
                  scope: "withContents",
                  side,
                  reach,
                  ...(keptWithContentsFrom === side ? { pressed: true } : {}),
              }
            : undefined;
    const decisions: (MergeRowDecision | undefined)[] = [
        ...MERGE_SIDES.flatMap((side) => [sidePick(facts, side), withContents(side)]),
        keepRemovedWith(states, row.id),
        mergeXml(row, row.pick, offers),
        row.pick === undefined ? undefined : { kind: "undo", scope: row.pick.scope },
    ];
    return decisions.filter((decision) => decision !== undefined);
}

/** The menu decides only a step the pad cannot reach, one no canvas draws. */
export function decidesInMenu(step: { readonly shapeless: boolean }): boolean {
    return step.shapeless;
}

/** The host's offer of what was removed with `elementId`, kept from the side that kept the element. */
export function keepRemovedWith(
    states: MergeRowStates,
    elementId: string,
): Extract<MergePadDecision, { kind: "keepRemovedWith" }> | undefined {
    const offer = states.restoreOffer;
    return offer?.elementId === elementId
        ? { kind: "keepRemovedWith", side: otherSide(offer.removedBy), offer }
        : undefined;
}

/** Merging the XML by hand, where the host can and the pick allows it; editing it once merged. */
function mergeXml(
    element: { readonly handMergeable?: true },
    pick: { readonly mergedByHand?: true } | undefined,
    offers: MergePadOffers,
): MergeXmlDecision | undefined {
    if (element.handMergeable !== true || !offers.elementXmlMerge) return undefined;
    return { kind: "mergeXml", mode: pick?.mergedByHand ? "edit" : "open" };
}

/** What tells whether a pick of a side changes anything. */
interface SidePickFacts {
    /** The side the user's pick keeps the element from. */
    readonly pickedSide?: MergeSide;
    /** The side the result takes the element from, picked or not. */
    readonly takenSide?: MergeSide;
    readonly lacking?: { readonly side: MergeSide; readonly lack: MergePaneOtherSideLack };
}

/**
 * A pick of `side`: keep the element where the side holds it, unless the
 * user's pick keeps it from there already; leave it out where the side lacks
 * it, unless the result leaves it out already.
 */
function sidePick(facts: SidePickFacts, side: MergeSide): MergePadDecision | undefined {
    if (facts.lacking?.side === side) {
        return facts.takenSide === side
            ? undefined
            : { kind: "leaveOut", side, otherSideLacks: facts.lacking.lack };
    }
    return facts.pickedSide === side ? undefined : { kind: "keep", scope: "element", side };
}
