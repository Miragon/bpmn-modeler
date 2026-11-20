import { editAgainRequest, type MergePaneRequest } from "./mergeActedDecision";
import type { MergeCardAction } from "./mergeCardContent";
import { isRememberedHandMerge, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import type { MergeOutcomeAnswer, MergeOutcomeMemory } from "./mergeOutcomeMemory";

/** What the card does: close the one that shows, then show `show`, unless the change keeps it. */
export interface MergeCardChange {
    readonly close: boolean;
    readonly show?: MergeRememberedOutcome;
}

/**
 * What new states do to the card: this pane's new outcome shows at its
 * element, unless it was decided in a menu row, which says it there; any
 * other new outcome closes the card.
 */
export function cardOnAnswer(
    memory: MergeOutcomeMemory,
    answer: MergeOutcomeAnswer,
): MergeCardChange {
    if (answer === "keep") return { close: false };
    const show =
        answer === "show" ? outcomeToShowAt(memory, memory.latest?.outcome.elementId) : undefined;
    return { close: true, ...(show ? { show } : {}) };
}

/**
 * The card follows the selection: it closes when another element or none
 * is selected, and shows again when its element is selected again.
 */
export function cardOnSelection(
    memory: MergeOutcomeMemory,
    shownAt: string | undefined,
    selectedId: string | undefined,
): MergeCardChange {
    if (shownAt === selectedId) return { close: false };
    const show = outcomeToShowAt(memory, selectedId);
    return { close: shownAt !== undefined, ...(show ? { show } : {}) };
}

/** The latest outcome of this pane, shown again when its element is selected again. */
export function outcomeToShowAt(
    memory: MergeOutcomeMemory,
    elementId: string | undefined,
): MergeRememberedOutcome | undefined {
    const { latest } = memory;
    return latest?.acted.origin === "canvas" && latest.outcome.elementId === elementId
        ? latest
        : undefined;
}

/**
 * What a choice on the card or in a row does: Edit again reopens the merge
 * editor on the refused text, dropping resends the decision that asked
 * with the user's consent, and a dismiss forgets the outcome and closes it.
 */
export function chooseOn(
    memory: MergeOutcomeMemory,
    action: MergeCardAction,
): {
    readonly memory: MergeOutcomeMemory;
    readonly send?: { readonly request: MergePaneRequest; readonly dropsHandMerges: boolean };
    readonly close: boolean;
} {
    const { latest } = memory;
    if (latest === undefined) return { memory, close: false };
    switch (action) {
        case "dismiss": {
            const { latest: _dismissed, ...rest } = memory;
            return { memory: rest, close: true };
        }
        case "editAgain":
            return {
                memory,
                send: {
                    request: editAgainRequest(latest.outcome.elementId, latest.acted.origin),
                    dropsHandMerges: false,
                },
                close: false,
            };
        case "dropHandMerges":
            return isRememberedHandMerge(latest)
                ? { memory, close: false }
                : { memory, send: { request: latest.acted, dropsHandMerges: true }, close: false };
    }
}

/** What a decision from a menu row did, which that row says, on the pane that sent it. */
export function rowOutcome(memory: MergeOutcomeMemory): MergeRememberedOutcome | undefined {
    return memory.latest?.acted.origin === "menu" ? memory.latest : undefined;
}
