import type { MergePaneOtherSideLack, MergePickScope } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergePadDecision } from "./mergePadDecisions";

/** Where the user decided: on the canvas (the pad or the outcome card), or in a menu row. */
export type MergeDecisionOrigin = "canvas" | "menu";

/**
 * A pick or undo this pane sent, remembered with what the protocol's
 * outcome does not carry: the side it kept, or the side that lacks what it
 * left out and why.
 */
export type MergeActedDecision =
    | {
          readonly kind: "keep";
          readonly elementId: string;
          readonly scope: MergePickScope;
          readonly side: MergeSide;
          readonly origin: MergeDecisionOrigin;
      }
    | {
          readonly kind: "leaveOut";
          readonly elementId: string;
          /** The side that lacks the element, which the pick names. */
          readonly side: MergeSide;
          readonly otherSideLacks: MergePaneOtherSideLack;
          readonly origin: MergeDecisionOrigin;
      }
    | {
          readonly kind: "undo";
          readonly elementId: string;
          readonly scope: MergePickScope;
          readonly origin: MergeDecisionOrigin;
      };

/** The decision a pad entry sends for `elementId`. */
export function actedOnPad(elementId: string, decision: MergePadDecision): MergeActedDecision {
    return acted(elementId, decision, "canvas");
}

/** The decision a menu row sends for its shape-less element, which the row says it did. */
export function actedInMenu(elementId: string, decision: MergePadDecision): MergeActedDecision {
    return acted(elementId, decision, "menu");
}

/** Keeping the flows the other side removed keeps the element from `side` with them, from the pad or the card. */
export function keepRemovedWithDecision(
    elementId: string,
    side: MergeSide,
    origin: MergeDecisionOrigin = "canvas",
): MergeActedDecision {
    return { kind: "keep", elementId, scope: "withRemoved", side, origin };
}

function acted(
    elementId: string,
    decision: MergePadDecision,
    origin: MergeDecisionOrigin,
): MergeActedDecision {
    switch (decision.kind) {
        case "keep":
            return { kind: "keep", elementId, scope: decision.scope, side: decision.side, origin };
        case "leaveOut":
            return {
                kind: "leaveOut",
                elementId,
                side: decision.side,
                otherSideLacks: decision.otherSideLacks,
                origin,
            };
        case "keepRemovedWith":
            return keepRemovedWithDecision(elementId, decision.side, origin);
        case "undo":
            return { kind: "undo", elementId, scope: decision.scope, origin };
    }
}

/** What a remembered decision sends to the host. */
export type MergeDecisionCommand =
    | {
          readonly kind: "pick";
          readonly elementId: string;
          readonly scope: MergePickScope;
          readonly side: MergeSide;
      }
    | { readonly kind: "unpick"; readonly elementId: string; readonly scope: MergePickScope };

/** A leave-out is a pick of the side that lacks the element. */
export function mergeDecisionCommandOf(acted: MergeActedDecision): MergeDecisionCommand {
    const { elementId } = acted;
    switch (acted.kind) {
        case "keep":
            return { kind: "pick", elementId, scope: acted.scope, side: acted.side };
        case "leaveOut":
            return { kind: "pick", elementId, scope: "element", side: acted.side };
        case "undo":
            return { kind: "unpick", elementId, scope: acted.scope };
    }
}
