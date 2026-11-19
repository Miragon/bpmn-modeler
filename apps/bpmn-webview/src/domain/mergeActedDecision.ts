import type { MergePaneOtherSideLack, MergePickScope } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergePadDecision, MergePickDecision } from "./mergePadDecisions";

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

/**
 * A request to open an element's XML in the host's merge editor, remembered
 * so the pane that asked can show what the finished merge did.
 */
export interface MergeXmlRequest {
    readonly kind: "mergeXml";
    readonly elementId: string;
    readonly origin: MergeDecisionOrigin;
    /** Edit again: the editor starts from the text the merge refused last. */
    readonly resume?: true;
}

/** What a pane sends: a pick or undo, or a request to merge an element's XML by hand. */
export type MergePaneRequest = MergeActedDecision | MergeXmlRequest;

/** The decision a pad entry sends for `elementId`. */
export function actedOnPad(elementId: string, decision: MergePickDecision): MergeActedDecision {
    return acted(elementId, decision, "canvas");
}

/** What a pad entry sends for `elementId`: its decision, or the request to merge the XML. */
export function requestOnPad(elementId: string, decision: MergePadDecision): MergePaneRequest {
    return request(elementId, decision, "canvas");
}

/** What a menu row's button sends for its shape-less element. */
export function requestInMenu(elementId: string, decision: MergePadDecision): MergePaneRequest {
    return request(elementId, decision, "menu");
}

/** Edit again: opens the merge editor on the text the merge refused. */
export function editAgainRequest(elementId: string, origin: MergeDecisionOrigin): MergeXmlRequest {
    return { kind: "mergeXml", elementId, origin, resume: true };
}

function request(
    elementId: string,
    decision: MergePadDecision,
    origin: MergeDecisionOrigin,
): MergePaneRequest {
    return decision.kind === "mergeXml"
        ? { kind: "mergeXml", elementId, origin }
        : acted(elementId, decision, origin);
}

/** Keeping what the other side removed with the element keeps the element from `side` with it, from the pad or the card. */
export function keepRemovedWithDecision(
    elementId: string,
    side: MergeSide,
    origin: MergeDecisionOrigin = "canvas",
): MergeActedDecision {
    return { kind: "keep", elementId, scope: "withRemoved", side, origin };
}

function acted(
    elementId: string,
    decision: MergePickDecision,
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

/** What a remembered request sends to the host. */
export type MergeDecisionCommand =
    | {
          readonly kind: "pick";
          readonly elementId: string;
          readonly scope: MergePickScope;
          readonly side: MergeSide;
          readonly dropsHandMerges?: true;
      }
    | {
          readonly kind: "unpick";
          readonly elementId: string;
          readonly scope: MergePickScope;
          readonly dropsHandMerges?: true;
      }
    | { readonly kind: "openXmlMerge"; readonly elementId: string; readonly resume?: true };

/**
 * A leave-out is a pick of the side that lacks the element. A pick or undo
 * resent after the user agreed drops the versions merged by hand it moves
 * off their side.
 */
export function mergeDecisionCommandOf(
    request: MergePaneRequest,
    { dropsHandMerges = false }: { readonly dropsHandMerges?: boolean } = {},
): MergeDecisionCommand {
    const { elementId } = request;
    const dropping = dropsHandMerges ? { dropsHandMerges: true as const } : {};
    switch (request.kind) {
        case "keep":
            return {
                kind: "pick",
                elementId,
                scope: request.scope,
                side: request.side,
                ...dropping,
            };
        case "leaveOut":
            return { kind: "pick", elementId, scope: "element", side: request.side, ...dropping };
        case "undo":
            return { kind: "unpick", elementId, scope: request.scope, ...dropping };
        case "mergeXml":
            return { kind: "openXmlMerge", elementId, ...(request.resume ? { resume: true } : {}) };
    }
}
