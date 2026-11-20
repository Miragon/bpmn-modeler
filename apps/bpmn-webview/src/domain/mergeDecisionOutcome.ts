import type { MergePaneOutcome, MergePanePickAction } from "@miragon/bpmn-modeler-shared";

/** The host's outcome of a pick, a leave-out or an undo, which a pane sends. */
export type MergeDecisionOutcome = MergePaneOutcome & { readonly action: MergePanePickAction };

/** A decision the host refused, with what blocked it. */
export type MergeRefusal = Extract<MergeDecisionOutcome, { applied: false }>;

/** The host's answer to a finished merge of an element's XML by hand. */
export type MergeHandMergeOutcome = MergePaneOutcome & { readonly action: "mergeByHand" };

export function isHandMergeOutcome(outcome: MergePaneOutcome): outcome is MergeHandMergeOutcome {
    return outcome.action === "mergeByHand";
}

/** Whether the outcome is of a decision a pane sends; a merge by hand is none. */
export function isDecisionOutcome(outcome: MergePaneOutcome): outcome is MergeDecisionOutcome {
    return outcome.action !== "mergeByHand";
}

/**
 * Whether an undo freed the refusal: it took back one of the picks that
 * blocked it, every reason was such a pick, and none of them is left.
 */
export function refusalFreedBy(
    refusal: MergeRefusal,
    undoOutcome: MergeDecisionOutcome,
    pickedIds: ReadonlySet<string>,
): boolean {
    if (!undoOutcome.applied || undoOutcome.action !== "unpick") return false;
    const { blockedBy } = refusal;
    return (
        blockedBy.some((block) => block.elementId === undoOutcome.elementId) &&
        blockedBy.every(
            (block) => block.obstacle === "dependentPicked" && !pickedIds.has(block.elementId),
        )
    );
}
