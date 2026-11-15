import type { BlockedPick, PickOutcome } from "@miragon/bpmn-modeler-merge";
import type {
    MergePaneAction,
    MergePaneBlock,
    MergePaneOutcome,
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
 * and after name what it reopened, and a pick's kept side gets the offer of
 * the flows it left out.
 */
export function mergePickFeedback({
    action,
    elementId,
    keptSide,
    outcome,
    openBefore,
    openAfter,
}: {
    readonly action: MergePaneAction;
    readonly elementId: string;
    readonly keptSide?: MergeSide;
    readonly outcome: PickOutcome;
    readonly openBefore: readonly string[];
    readonly openAfter: readonly string[];
}): MergePickFeedback {
    if (!outcome.applied) {
        return {
            outcome: {
                applied: false,
                action,
                elementId,
                blockedBy: outcome.blockedBy.map(blockOf),
            },
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
        },
    };
    return outcome.connectionsLeftOut === undefined || keptSide === undefined
        ? shown
        : { ...shown, offer: { elementId, connections: outcome.connectionsLeftOut, keptSide } };
}

function blockOf({ reason: { element, requirement, obstacle } }: BlockedPick): MergePaneBlock {
    const ends = { elementId: element.id, targetId: requirement.target };
    return "missing" in obstacle
        ? { ...ends, obstacle: obstacle.kind, missing: obstacle.missing }
        : { ...ends, obstacle: obstacle.kind };
}

/** Every element a pane's legend names by id: the picks it lists and what the last outcome names. */
export function idsTheLegendNames(
    picksNotDrawn: readonly { readonly id: string }[],
    outcome: MergePaneOutcome | undefined,
): ReadonlySet<string> {
    const named = new Set(picksNotDrawn.map(({ id }) => id));
    if (outcome === undefined) return named;
    named.add(outcome.elementId);
    const outcomeIds = outcome.applied
        ? [...outcome.pulledIn, ...outcome.dropped, ...outcome.reopened]
        : outcome.blockedBy.flatMap(({ elementId, targetId }) => [elementId, targetId]);
    outcomeIds.forEach((id) => named.add(id));
    return named;
}
