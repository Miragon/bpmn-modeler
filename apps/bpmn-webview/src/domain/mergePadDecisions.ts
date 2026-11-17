import type {
    MergePanePickable,
    MergePaneRestoreOffer,
    MergePaneStates,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { type MergeSide, otherSide } from "@miragon/bpmn-modeler-types";

/** One decision the context pad offers on an element the pane draws. */
export type MergePadDecision =
    | {
          readonly kind: "keep";
          readonly scope: "element" | "withContents";
          readonly side: MergeSide;
      }
    /** Picks the side whose version lacks the element, which leaves it out of the result. */
    | {
          readonly kind: "leaveOut";
          readonly side: MergeSide;
          readonly otherSideLacks: NonNullable<MergePanePickable["otherSideLacks"]>;
      }
    /** Picks the element again with the flows `offer` names. */
    | {
          readonly kind: "keepRemovedFlows";
          readonly side: MergeSide;
          readonly offer: MergePaneRestoreOffer;
      }
    | { readonly kind: "undo"; readonly scope: MergePickScope };

/** What the pad reads of the host's states. */
export type MergePadStates = Pick<
    MergePaneStates,
    "caption" | "pickable" | "badges" | "marks" | "restoreOffer"
>;

/**
 * The decisions the pad offers on `elementId`, in its order: keep it from
 * the pane's side, keep a container with everything inside, leave it out
 * where the other side lacks it, keep the flows the host offers with it,
 * undo the user's pick. An entry whose outcome the result already has is
 * left out, so every entry changes something.
 */
export function mergePadDecisions(
    states: MergePadStates,
    elementId: string,
): readonly MergePadDecision[] {
    const pickable = states.pickable.find(({ id }) => id === elementId);
    if (pickable === undefined) return [];
    const paneSide = states.caption.side;
    const badge = states.badges.find(({ id }) => id === elementId);
    const keptHere = badge?.kind === "keptHere" ? badge.scope : undefined;
    const decisions: MergePadDecision[] = [];
    if (keptHere === undefined) decisions.push({ kind: "keep", scope: "element", side: paneSide });
    if (pickable.container && keptHere !== "withContents") {
        decisions.push({ kind: "keep", scope: "withContents", side: paneSide });
    }
    const { otherSideLacks } = pickable;
    if (otherSideLacks !== undefined && !states.marks.takenFromOtherSide.includes(elementId)) {
        decisions.push({ kind: "leaveOut", side: otherSide(paneSide), otherSideLacks });
    }
    if (states.restoreOffer?.elementId === elementId) {
        decisions.push({ kind: "keepRemovedFlows", side: paneSide, offer: states.restoreOffer });
    }
    if (pickable.undo !== undefined) decisions.push({ kind: "undo", scope: pickable.undo });
    return decisions;
}

/** The legend decides only a step the pad cannot reach, one no canvas draws. */
export function decidesInLegend(step: { readonly shapeless: boolean }): boolean {
    return step.shapeless;
}
