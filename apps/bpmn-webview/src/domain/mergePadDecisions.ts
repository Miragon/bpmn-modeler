import type {
    MergeHostOffers,
    MergePaneContainerReach,
    MergePaneOtherSideLack,
    MergePaneRestoreOffer,
    MergePaneShapelessRow,
    MergePaneStates,
    MergePickScope,
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
    offers: MergePadOffers,
): readonly MergePadDecision[] {
    const pickable = states.pickable.find(({ id }) => id === elementId);
    if (pickable === undefined) return [];
    const paneSide = states.caption.side;
    const lacking =
        pickable.otherSideLacks === undefined
            ? undefined
            : { side: otherSide(paneSide), lack: pickable.otherSideLacks };
    const facts: MergeDecisionFacts = {
        pick: states.badges.find(({ id }) => id === elementId),
        takenSide: pickable.takenSide,
        lacking,
        container: pickable.container,
        handMergeable: pickable.handMergeable,
        undo: pickable.undo,
        restoreOffer: keepRemovedWith(states, elementId),
    };
    return decisionsOn(
        facts,
        {
            sides: lacking === undefined ? [paneSide] : [paneSide, lacking.side],
            heldKeepInside: "leftOut",
        },
        offers,
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
        pick: row.pick,
        takenSide: row.takenSide,
        lacking: row.lackingSide,
        container: row.container,
        handMergeable: row.handMergeable,
        undo: row.pick?.scope,
        restoreOffer: keepRemovedWith(states, row.id),
    };
    return decisionsOn(facts, { sides: MERGE_SIDES, heldKeepInside: "pressed" }, offers);
}

/** The menu decides only a step the pad cannot reach, one no canvas draws. */
export function decidesInMenu(step: { readonly shapeless: boolean }): boolean {
    return step.shapeless;
}

/** The host's offer of what was removed with `elementId`, kept from the side that kept the element. */
export function keepRemovedWith(
    states: MergeRowStates,
    elementId: string,
): MergeKeepRemovedWith | undefined {
    const offer = states.restoreOffer;
    return offer?.elementId === elementId
        ? { kind: "keepRemovedWith", side: otherSide(offer.removedBy), offer }
        : undefined;
}

/** Merge XML can be offered on the element: its pick allows a merge by hand and the host has a merge editor. */
export function offersMergeXml(
    element: { readonly handMergeable?: true },
    offers: MergePadOffers,
): boolean {
    return element.handMergeable === true && offers.elementXmlMerge;
}

type MergeKeepRemovedWith = Extract<MergePadDecision, { kind: "keepRemovedWith" }>;

/** What decides the entries offered on one element, read from the pad's states or from a menu row. */
interface MergeDecisionFacts {
    /** The user's pick: the side it keeps the element from, how far, and whether a version merged by hand replaces it. */
    readonly pick?: {
        readonly keptSide: MergeSide;
        readonly scope: MergePickScope;
        readonly mergedByHand?: true;
    };
    /** The side the result takes the element from, picked or not. */
    readonly takenSide?: MergeSide;
    readonly lacking?: { readonly side: MergeSide; readonly lack: MergePaneOtherSideLack };
    readonly container?: MergePaneContainerReach;
    readonly handMergeable?: true;
    /** What Undo takes back, set while the user's pick decides the element. */
    readonly undo?: MergePickScope;
    readonly restoreOffer?: MergeKeepRemovedWith;
}

/** Where the entries show: the sides offered for a pick, and what becomes of a keep with everything inside that the user's pick holds. */
interface MergeDecisionSurface {
    readonly sides: readonly MergeSide[];
    /** The pad leaves it out, as it changes nothing; the row keeps it pressed to show which reach the pick has. */
    readonly heldKeepInside: "leftOut" | "pressed";
}

/** The one ordered list of entries the pad and the menu row offer; each builder leaves out an entry that would change nothing. */
function decisionsOn(
    facts: MergeDecisionFacts,
    surface: MergeDecisionSurface,
    offers: MergePadOffers,
): readonly MergeRowDecision[] {
    const decisions: (MergeRowDecision | undefined)[] = [
        ...surface.sides.flatMap((side) => [
            sidePick(facts, side),
            keepInside(facts, side, surface),
        ]),
        facts.restoreOffer,
        mergeXml(facts, offers),
        facts.undo === undefined ? undefined : { kind: "undo", scope: facts.undo },
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
    if (facts.lacking?.side === side) {
        return facts.takenSide === side
            ? undefined
            : { kind: "leaveOut", side, otherSideLacks: facts.lacking.lack };
    }
    return facts.pick?.keptSide === side ? undefined : { kind: "keep", scope: "element", side };
}

/** Keeping a container from `side` with everything inside, where the side holds it; once the user's pick holds it, as the surface shows that. */
function keepInside(
    facts: MergeDecisionFacts,
    side: MergeSide,
    surface: MergeDecisionSurface,
): MergeRowKeepInside | undefined {
    const reach = facts.container;
    if (reach === undefined || facts.lacking?.side === side) return undefined;
    const keep: MergeKeepInside = { kind: "keep", scope: "withContents", side, reach };
    const held = facts.pick?.keptSide === side && facts.pick.scope === "withContents";
    if (!held) return keep;
    return surface.heldKeepInside === "pressed" ? { ...keep, pressed: true } : undefined;
}
