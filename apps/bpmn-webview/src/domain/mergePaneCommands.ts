import type { MergePadEntry, MergePaneCommand } from "@miragon/bpmn-modeler-shared";

import { keepsEverythingInside, type MergePadDecision } from "./mergePadDecisions";

/** The pad entry that shows a decision, which a keyboard command of the same name runs. */
export function padEntryOf(decision: MergePadDecision): MergePadEntry {
    return keepsEverythingInside(decision) ? "keepInside" : decision.kind;
}

/** The decision a keyboard command runs: the pad's entry for it, or none where the pad offers none. */
export function padDecisionFor(
    decisions: readonly MergePadDecision[],
    entry: MergePadEntry,
): MergePadDecision | undefined {
    return decisions.find((decision) => padEntryOf(decision) === entry);
}

/**
 * The keyboard commands a merge pane can run: the pad's entries on its
 * selection, in the pad's order, ‹ › while there is a step, and Build always, since a blocked
 * build is answered by the host's refusal.
 */
export function mergePaneCommands(
    decisions: readonly MergePadDecision[],
    { canStep }: { readonly canStep: boolean },
): readonly MergePaneCommand[] {
    return [
        ...decisions.map(padEntryOf),
        ...(canStep ? (["next", "previous"] as const) : []),
        "build",
    ];
}
