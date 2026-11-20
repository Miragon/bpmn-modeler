import {
    asksToDropHandMerges,
    type BlockedPick,
    type HandMergeOutcome,
    type MergeDecisions,
    type PickOutcome,
} from "@miragon/bpmn-modeler-merge";
import {
    handMergeRefusalNamedIds,
    type MergePaneAction,
    type MergePaneBlock,
    type MergePaneOutcome,
    type MergePaneRefusedDecision,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { type PickRestoreOffer, reopenedConflicts } from "../domain/pickFeedback";

/** What the user's last pick or undo did, shown on both panes until the next one. */
export interface MergePickFeedback {
    readonly outcome: MergePaneOutcome;
    readonly offer?: PickRestoreOffer;
}

/**
 * What a pick or an undo did, as the panes show it: the open conflicts before
 * and after name what it reopened, a pick's kept side gets the offer of the
 * flows and boundary events it left out, and an undo names the refused
 * decision it freed.
 */
export function mergePickFeedback({
    action,
    elementId,
    keptSide,
    outcome,
    openBefore,
    openAfter,
    freed,
}: {
    readonly action: MergePaneAction;
    readonly elementId: string;
    readonly keptSide?: MergeSide;
    readonly outcome: PickOutcome;
    readonly openBefore: readonly string[];
    readonly openAfter: readonly string[];
    readonly freed?: MergePaneRefusedDecision;
}): MergePickFeedback {
    if (!outcome.applied) {
        const refused = { applied: false, action, elementId } as const;
        return {
            outcome: asksToDropHandMerges(outcome)
                ? { ...refused, blockedBy: [], handMergesAtStake: outcome.handMergesAtStake }
                : { ...refused, blockedBy: outcome.blockedBy.map(blockOf) },
        };
    }
    const shown: MergePickFeedback = {
        outcome: {
            applied: true,
            action,
            elementId,
            pulledIn: outcome.pulledIn,
            dropped: outcome.dropped,
            reopened: reopenedConflicts(openBefore, openAfter),
            ...(freed === undefined ? {} : { freed }),
        },
    };
    const { connectionsLeftOut, boundaryEventsLeftOut } = outcome;
    if (keptSide === undefined) return shown;
    if (connectionsLeftOut === undefined && boundaryEventsLeftOut === undefined) return shown;
    const connections = connectionsLeftOut ?? [];
    const offer: PickRestoreOffer =
        boundaryEventsLeftOut === undefined
            ? { elementId, connections, keptSide }
            : { elementId, connections, boundaryEvents: boundaryEventsLeftOut, keptSide };
    return { ...shown, offer };
}

/**
 * What the finish of an element's merge editor did, as the panes show it:
 * taken, refused, or closed without a save. No finish changes a pick, so the
 * restore offer of the last pick stays. Each finish counts on from the last
 * one's, so a finish that repeats it word for word still reads as new.
 */
export function handMergeFeedback(
    elementId: string,
    finish: HandMergeOutcome | "discarded",
    last?: MergePickFeedback,
): MergePickFeedback {
    const outcome = {
        ...handMergeOutcome(elementId, finish),
        finish: (last?.outcome.finish ?? 0) + 1,
    };
    return last?.offer === undefined ? { outcome } : { outcome, offer: last.offer };
}

function handMergeOutcome(
    elementId: string,
    finish: HandMergeOutcome | "discarded",
): MergePaneOutcome {
    const action = "mergeByHand";
    if (finish === "discarded") {
        return { applied: false, action, elementId, blockedBy: [], discarded: true };
    }
    if (!finish.applied) {
        return {
            applied: false,
            action,
            elementId,
            blockedBy: [],
            handMergeRefusal: finish.refusal,
        };
    }
    return { applied: true, action, elementId, pulledIn: [], dropped: [], reopened: [] };
}

function blockOf({ reason: { element, requirement, obstacle } }: BlockedPick): MergePaneBlock {
    const ends = { elementId: element.id, targetId: requirement.target };
    return "missing" in obstacle
        ? { ...ends, obstacle: obstacle.kind, missing: obstacle.missing }
        : { ...ends, obstacle: obstacle.kind };
}

/** The ids of the merge's open conflicts, which before and after a decision name what it reopened. */
export function openConflictIds(decisions: Pick<MergeDecisions, "openConflicts">): string[] {
    return decisions.openConflicts.map(({ id }) => id);
}

/** Every element a pane names in words: the shape-less elements its menu lists and what the last outcome names. */
export function idsNamedInWords(
    listed: readonly { readonly id: string }[],
    outcome: MergePaneOutcome | undefined,
): ReadonlySet<string> {
    const named = new Set(listed.map(({ id }) => id));
    if (outcome === undefined) return named;
    named.add(outcome.elementId);
    const outcomeIds = outcome.applied
        ? [...outcome.pulledIn, ...outcome.dropped, ...outcome.reopened]
        : [
              ...outcome.blockedBy.flatMap(({ elementId, targetId }) => [elementId, targetId]),
              ...(outcome.handMergesAtStake ?? []),
              ...(outcome.handMergeRefusal === undefined
                  ? []
                  : handMergeRefusalNamedIds(outcome.handMergeRefusal)),
          ];
    outcomeIds.forEach((id) => named.add(id));
    return named;
}
