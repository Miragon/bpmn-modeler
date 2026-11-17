import type { MergePaneOutcome, MergePaneStates } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import type { MergeRefusal, MergeRememberedOutcome } from "./mergeOutcomeCard";

/** What the pane's memory of its outcomes reads of the host's states. */
export type MergeOutcomeStates = Pick<
    MergePaneStates,
    "lastOutcome" | "restoreOffer" | "badges" | "picksNotDrawn" | "allSteps"
>;

/**
 * What a merge pane remembers of the decisions it sent, until it reloads:
 * the one awaiting the host's answer, the latest outcome of its own, the
 * last refusal an undo may free, and what the last states said of the
 * outcome and the picks ({@link decisionsSeen}).
 */
export interface MergeOutcomeMemory {
    readonly sent?: MergeActedDecision;
    readonly latest?: MergeRememberedOutcome;
    readonly refused?: MergeRefusal;
    readonly seen?: string;
}

/** What new states mean for the card: a new outcome of this pane, a newer one of the partner, or nothing new. */
export type MergeOutcomeAnswer = "show" | "forget" | "keep";

/** What the card does: close the one that shows, then show `show`, unless the change keeps it. */
export interface MergeCardChange {
    readonly close: boolean;
    readonly show?: MergeRememberedOutcome;
}

export const EMPTY_OUTCOME_MEMORY: MergeOutcomeMemory = {};

export function rememberSent(
    memory: MergeOutcomeMemory,
    acted: MergeActedDecision,
): MergeOutcomeMemory {
    return { ...memory, sent: acted };
}

/**
 * Reads the host's latest outcome: the answer to the decision this pane
 * sent becomes its latest outcome; any other outcome the pane has not seen
 * is the partner's, newer than this pane's, which the pane forgets.
 */
export function answerStates(
    memory: MergeOutcomeMemory,
    states: MergeOutcomeStates,
): { readonly memory: MergeOutcomeMemory; readonly answer: MergeOutcomeAnswer } {
    const outcome = states.lastOutcome;
    const { sent } = memory;
    if (outcome !== undefined && sent !== undefined && answers(outcome, sent)) {
        const lifted = liftedRefusal(memory.refused, outcome, states);
        const refused = outcome.applied ? (lifted ? undefined : memory.refused) : outcome;
        return {
            memory: {
                latest: { outcome, acted: sent, ...(lifted ? { lifted } : {}) },
                ...(refused ? { refused } : {}),
                seen: decisionsSeen(states),
            },
            answer: "show",
        };
    }
    const seen = decisionsSeen(states);
    if (seen === memory.seen) return { memory, answer: "keep" };
    return { memory: { ...(sent ? { sent } : {}), seen }, answer: "forget" };
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

/** What a decision from a menu row did, which that row says, on the pane that sent it. */
export function rowOutcome(memory: MergeOutcomeMemory): MergeRememberedOutcome | undefined {
    return memory.latest?.acted.origin === "menu" ? memory.latest : undefined;
}

/**
 * The outcome with the picks and the offer, which tell a partner's decision
 * from the last one where the outcome, which names no side, reads the same:
 * keeping the element again from the other side.
 */
function decisionsSeen(states: MergeOutcomeStates): string {
    const { lastOutcome, badges, picksNotDrawn, restoreOffer } = states;
    const picks = [...badges, ...picksNotDrawn].map(({ id, keptSide, scope }) => [
        id,
        keptSide,
        scope,
    ]);
    return JSON.stringify([lastOutcome ?? null, picks, restoreOffer ?? null]);
}

/** An outcome answers a decision of its element, an undo by an undo, a pick or leave-out by either. */
function answers(outcome: MergePaneOutcome, sent: MergeActedDecision): boolean {
    return (
        outcome.elementId === sent.elementId &&
        (outcome.action === "unpick") === (sent.kind === "undo")
    );
}

/**
 * The refusal an undo freed: it took back one of the picks that blocked it,
 * every reason was such a pick, and none of them is left.
 */
function liftedRefusal(
    refused: MergeRefusal | undefined,
    outcome: MergePaneOutcome,
    states: MergeOutcomeStates,
): MergeRefusal | undefined {
    if (refused === undefined || !outcome.applied || outcome.action !== "unpick") return undefined;
    const { blockedBy } = refused;
    if (!blockedBy.some((block) => block.elementId === outcome.elementId)) return undefined;
    const picks = new Set([
        ...states.badges.map(({ id }) => id),
        ...states.picksNotDrawn.map(({ id }) => id),
    ]);
    return blockedBy.every(
        (block) => block.obstacle === "dependentPicked" && !picks.has(block.elementId),
    )
        ? refused
        : undefined;
}
