import type { HandMergeOutcome, MergeDecisions, PickOutcome } from "@miragon/bpmn-modeler-merge";

import {
    handMergeFeedback,
    type MergePickFeedback,
    mergePickFeedback,
    openConflictIds,
} from "./mergePickFeedback";
import { type PaneDecision, PaneRefusal } from "./paneRefusal";

/**
 * What a merge view remembers of its panes' decisions between posts: the
 * feedback of the last one, which every pane shows, and the last refusal an
 * undo of its pane may free.
 */
export class MergeViewMemory {
    private lastFeedback?: MergePickFeedback;
    private refusal?: PaneRefusal;

    get feedback(): MergePickFeedback | undefined {
        return this.lastFeedback;
    }

    /** Remembers what a pick or an undo did, `openBefore` naming the conflicts open before it. */
    decided(
        decided: PaneDecision,
        outcome: PickOutcome,
        decisions: MergeDecisions,
        openBefore: readonly string[],
    ): void {
        const { refusal, freed } = PaneRefusal.after(this.refusal, decided, outcome, decisions);
        this.refusal = refusal;
        const { action, decision } = decided;
        this.lastFeedback = mergePickFeedback({
            action,
            elementId: decision.id,
            ...(decision.kind === "pick" ? { keptSide: decision.side } : {}),
            outcome,
            openBefore,
            openAfter: openConflictIds(decisions),
            ...(freed === undefined ? {} : { freed }),
        });
    }

    /** Remembers the finish of an element's merge editor; it changes no pick, so the refusal stays. */
    finishedHandMerge(elementId: string, finish: HandMergeOutcome | "discarded"): void {
        this.lastFeedback = handMergeFeedback(elementId, finish, this.lastFeedback);
    }
}
