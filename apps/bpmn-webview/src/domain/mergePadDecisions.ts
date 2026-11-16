import type {
    MergePaneBadge,
    MergePanePickable,
    MergePaneRestoreOffer,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

/** One decision the context pad offers on a drawn element. */
export type MergePadDecision =
    | {
          readonly kind: "keep";
          readonly scope: "element" | "withContents";
          readonly side: MergeSide;
      }
    /** Picks the side that removed the element, which keeps it out of the result. */
    | { readonly kind: "leaveOut"; readonly removedBy: MergeSide }
    /** Picks the element again with the flows `offer` names, as the host offered after a pick. */
    | {
          readonly kind: "keepRemovedFlows";
          readonly side: MergeSide;
          readonly offer: MergePaneRestoreOffer;
      }
    | { readonly kind: "undo"; readonly scope: MergePickScope };

/** What a pane knows of an element when its pad opens; the host decided all of it. */
export interface MergePadContext {
    readonly pickable: MergePanePickable;
    readonly paneSide: MergeSide;
    /** The user's pick of the element, as this pane draws it. */
    readonly badge?: MergePaneBadge;
    /** The pane marks the element taken from the other side: the result follows that side. */
    readonly takenFromOtherSide: boolean;
    readonly restoreOffer?: MergePaneRestoreOffer;
}

const OTHER_SIDE: Readonly<Record<MergeSide, MergeSide>> = {
    current: "incoming",
    incoming: "current",
};

/**
 * The decisions the pad offers, in its order: keep the element from this
 * pane's side, with everything inside for a container, leave it out where
 * the other side removed it, keep the flows removed with it, undo the pick.
 * A decision the result already follows is left out, so every entry changes
 * something.
 */
export function mergePadDecisions(context: MergePadContext): readonly MergePadDecision[] {
    const { pickable, paneSide, badge, restoreOffer } = context;
    const keptHere = badge?.kind === "keptHere" ? badge.scope : undefined;
    const decisions: MergePadDecision[] = [];
    if (keptHere === undefined) decisions.push({ kind: "keep", scope: "element", side: paneSide });
    if (pickable.container && keptHere !== "withContents") {
        decisions.push({ kind: "keep", scope: "withContents", side: paneSide });
    }
    if (pickable.removedByOtherSide && !context.takenFromOtherSide) {
        decisions.push({ kind: "leaveOut", removedBy: OTHER_SIDE[paneSide] });
    }
    if (restoreOffer?.elementId === pickable.id) {
        decisions.push({ kind: "keepRemovedFlows", side: paneSide, offer: restoreOffer });
    }
    if (pickable.undo !== undefined) decisions.push({ kind: "undo", scope: pickable.undo });
    return decisions;
}
