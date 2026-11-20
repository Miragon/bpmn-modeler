import { editAgainRequest, type MergePaneRequest } from "./mergeActedDecision";
import type { MergeCardAction } from "./mergeCardContent";
import { isRememberedHandMerge, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import type { MergeOutcomeAnswer, MergeOutcomeMemory } from "./mergeOutcomeMemory";

/** What a rule does to the card; a shown card closes before another shows. */
export type MergeCardChange =
    | { readonly kind: "show"; readonly outcome: MergeRememberedOutcome }
    | { readonly kind: "close" }
    | { readonly kind: "remark" }
    | { readonly kind: "keep" };

const KEEP_CARD: MergeCardChange = { kind: "keep" };

/** What settling new states does: the card's change and the row outcome to announce once. */
export interface MergeSettle {
    readonly card: MergeCardChange;
    readonly rowOutcome?: MergeRememberedOutcome;
}

/**
 * What new states do once the pane repainted: this pane's new outcome shows
 * at its element, unless it was decided in a menu row, which closes the card
 * and says it in that row, announced once; the partner's newer outcome
 * closes the card; nothing new marks the card's blockers again.
 */
export function settleOn(memory: MergeOutcomeMemory, answer: MergeOutcomeAnswer): MergeSettle {
    if (answer === "keep") return { card: { kind: "remark" } };
    if (answer === "forget") return { card: { kind: "close" } };
    const show = outcomeToShowAt(memory, memory.latest?.outcome.elementId);
    if (show !== undefined) return { card: { kind: "show", outcome: show } };
    const said = rowOutcome(memory);
    return { card: { kind: "close" }, ...(said ? { rowOutcome: said } : {}) };
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
    if (shownAt === selectedId) return KEEP_CARD;
    const show = outcomeToShowAt(memory, selectedId);
    if (show !== undefined) return { kind: "show", outcome: show };
    return shownAt === undefined ? KEEP_CARD : { kind: "close" };
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
    readonly card: MergeCardChange;
} {
    const { latest } = memory;
    if (latest === undefined) return { memory, card: KEEP_CARD };
    switch (action) {
        case "dismiss": {
            const { latest: _dismissed, ...rest } = memory;
            return { memory: rest, card: { kind: "close" } };
        }
        case "editAgain":
            return {
                memory,
                send: {
                    request: editAgainRequest(latest.outcome.elementId, latest.acted.origin),
                    dropsHandMerges: false,
                },
                card: KEEP_CARD,
            };
        case "dropHandMerges":
            return isRememberedHandMerge(latest)
                ? { memory, card: KEEP_CARD }
                : {
                      memory,
                      send: { request: latest.acted, dropsHandMerges: true },
                      card: KEEP_CARD,
                  };
    }
}

/** What a decision from a menu row did, which that row says, on the pane that sent it. */
export function rowOutcome(memory: MergeOutcomeMemory): MergeRememberedOutcome | undefined {
    return memory.latest?.acted.origin === "menu" ? memory.latest : undefined;
}
