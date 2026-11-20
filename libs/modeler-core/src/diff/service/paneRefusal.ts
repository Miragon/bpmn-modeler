import {
    asksToDropHandMerges,
    type MergeDecisions,
    type PickOutcome,
    type ScopedDecision,
} from "@miragon/bpmn-modeler-merge";
import type { MergePanePickAction, MergePaneRefusedDecision } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import type { DiffSession } from "./DiffSession";

/** A pane of a merge view: its side in its tab, since another tab's pane of that side is another webview. */
export interface DecidingPane {
    readonly tab: DiffSession;
    readonly side: DiffSide;
}

/** A decision a pane sent: what the user did, on which pane, and what the merge decides. */
export interface PaneDecision {
    readonly pane: DecidingPane;
    readonly action: MergePanePickAction;
    readonly decision: ScopedDecision;
}

/** What a refusal asks the merge. */
export type RefusalQuestions = Pick<MergeDecisions, "wouldApply" | "decidesAnything">;

/** What a decision leaves of a merge view's last refusal: the refusal it keeps, and the refused decision an undo freed. */
export interface PaneRefusalAfter {
    readonly refusal?: PaneRefusal;
    readonly freed?: MergePaneRefusedDecision;
}

/**
 * The last decision of a merge view the merge blocked, kept while it stays
 * blocked and its pane decides on, so the pane's undo that lets the merge
 * apply it can say so. The merge answers whether it would apply; the pane
 * repeats no rule of the merge's.
 */
export class PaneRefusal {
    private constructor(private readonly refused: PaneDecision) {}

    /**
     * A blocked decision becomes the refusal; one refused for the versions
     * merged by hand it would drop asks the user instead and keeps none. Any
     * other pane's decision is newer than the refusal, which its pane forgets,
     * and a refused undo whose pick is gone has nothing left to free.
     */
    static after(
        refusal: PaneRefusal | undefined,
        decided: PaneDecision,
        outcome: PickOutcome,
        decisions: RefusalQuestions,
    ): PaneRefusalAfter {
        if (!outcome.applied) {
            return asksToDropHandMerges(outcome) ? {} : { refusal: new PaneRefusal(decided) };
        }
        return refusal?.afterApplied(decided, decisions) ?? {};
    }

    private afterApplied(decided: PaneDecision, decisions: RefusalQuestions): PaneRefusalAfter {
        if (!this.sentBy(decided.pane)) return {};
        if (!decisions.decidesAnything(this.refused.decision)) return {};
        if (!decisions.wouldApply(this.refused.decision)) return { refusal: this };
        return decided.action === "unpick" ? { freed: this.named() } : {};
    }

    private sentBy({ tab, side }: DecidingPane): boolean {
        return tab === this.refused.pane.tab && side === this.refused.pane.side;
    }

    private named(): MergePaneRefusedDecision {
        return { action: this.refused.action, elementId: this.refused.decision.id };
    }
}
