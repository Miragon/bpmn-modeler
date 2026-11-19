import type { MergePaneOutcome, MergePanePickAction } from "@miragon/bpmn-modeler-shared";

/** The host's outcome of a pick, a leave-out or an undo, which a pane sends. */
export type MergeDecisionOutcome = MergePaneOutcome & { readonly action: MergePanePickAction };

/** A decision the host refused, with what blocked it. */
export type MergeRefusal = Extract<MergeDecisionOutcome, { applied: false }>;

/** Whether the outcome is of a decision a pane sends; a merge by hand is none. */
export function isDecisionOutcome(outcome: MergePaneOutcome): outcome is MergeDecisionOutcome {
    return outcome.action !== "mergeByHand";
}
