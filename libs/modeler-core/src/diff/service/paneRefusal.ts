import type { MergeDecisions, PickOutcome, ScopedDecision } from "@miragon/bpmn-modeler-merge";
import type { MergePanePickAction, MergePaneRefusedDecision } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

/** A decision a pane sent: what the user did, on which pane, and what the merge decides. */
export interface PaneDecision {
    readonly pane: DiffSide;
    readonly action: MergePanePickAction;
    readonly decision: ScopedDecision;
}

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
     * merged by hand it would drop asks the user instead and keeps none. The
     * partner's decision is newer than the refusal, which its pane forgets.
     */
    static after(
        refusal: PaneRefusal | undefined,
        decided: PaneDecision,
        outcome: PickOutcome,
        decisions: Pick<MergeDecisions, "wouldApply">,
    ): PaneRefusalAfter {
        if (!outcome.applied) {
            return "blockedBy" in outcome ? { refusal: new PaneRefusal(decided) } : {};
        }
        return refusal?.afterApplied(decided, decisions) ?? {};
    }

    private afterApplied(
        decided: PaneDecision,
        decisions: Pick<MergeDecisions, "wouldApply">,
    ): PaneRefusalAfter {
        if (decided.pane !== this.refused.pane) return {};
        if (!decisions.wouldApply(this.refused.decision)) return { refusal: this };
        return this.isFreedBy(decided) ? { freed: this.named() } : {};
    }

    /** An undo frees the refusal, unless it is the refused undo itself, sent again. */
    private isFreedBy({ action, decision }: PaneDecision): boolean {
        if (action !== "unpick") return false;
        return action !== this.refused.action || decision.id !== this.refused.decision.id;
    }

    private named(): MergePaneRefusedDecision {
        return { action: this.refused.action, elementId: this.refused.decision.id };
    }
}
