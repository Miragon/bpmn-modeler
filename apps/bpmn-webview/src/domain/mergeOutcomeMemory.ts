import type { MergePaneStates } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision, MergePaneRequest, MergeXmlRequest } from "./mergeActedDecision";
import {
    isDecisionOutcome,
    isHandMergeOutcome,
    type MergeDecisionOutcome,
    type MergeRefusal,
    refusalFreedBy,
} from "./mergeDecisionOutcome";
import { type MergePanePickStates, panePicks } from "./mergeElementPick";
import type { MergeRememberedOutcome } from "./mergeOutcomeCard";

/** What the pane's memory of its outcomes reads of the host's states. */
export type MergeOutcomeStates = Pick<
    MergePaneStates,
    "lastOutcome" | "restoreOffer" | "allSteps"
> &
    MergePanePickStates;

/**
 * What a merge pane remembers of the decisions it sent, until it reloads:
 * the one awaiting the host's answer, the merges by hand it asked for whose
 * editors may still be open, the latest outcome of its own, the last
 * refusal an undo may free, and what the last states said of the outcome
 * and the picks ({@link decisionsSeen}).
 */
export interface MergeOutcomeMemory {
    readonly sent?: MergeActedDecision;
    readonly handMergesSent?: readonly MergeXmlRequest[];
    readonly latest?: MergeRememberedOutcome;
    readonly refused?: MergeRefusal;
    readonly seen?: string;
}

/** What new states mean for the card: a new outcome of this pane, a newer one of the partner, or nothing new. */
export type MergeOutcomeAnswer = "show" | "forget" | "keep";

export const EMPTY_OUTCOME_MEMORY: MergeOutcomeMemory = {};

/**
 * A pick or undo awaits the host's next states; a merge by hand awaits its
 * editor's finish, however many states come before it, one per element.
 */
export function rememberSent(
    memory: MergeOutcomeMemory,
    request: MergePaneRequest,
): MergeOutcomeMemory {
    if (request.kind !== "mergeXml") return { ...memory, sent: request };
    return {
        ...memory,
        handMergesSent: [...withoutHandMerge(memory, request.elementId), request],
    };
}

/**
 * Reads the host's latest outcome: the answer to the decision this pane
 * sent, or a newly seen finish of a merge by hand it asked for, becomes its
 * latest outcome; any other outcome the pane has not seen is the partner's,
 * newer than this pane's, which the pane forgets.
 */
export function answerStates(memory: MergeOutcomeMemory, states: MergeOutcomeStates): Answered {
    const seen = decisionsSeen(states);
    const ownDecision = answerOwnDecision(memory, states, seen);
    if (ownDecision !== undefined) return ownDecision;
    if (seen === memory.seen) return { memory, answer: "keep" };
    return answerOwnHandMerge(memory, states, seen) ?? forgetForPartner(memory, seen);
}

/** What the pane remembers and what new states mean for its card. */
interface Answered {
    readonly memory: MergeOutcomeMemory;
    readonly answer: MergeOutcomeAnswer;
}

/** The outcome that answers the pick or undo this pane sent, however often the states repeat it. */
function answerOwnDecision(
    memory: MergeOutcomeMemory,
    states: MergeOutcomeStates,
    seen: string,
): Answered | undefined {
    const outcome = states.lastOutcome;
    const { sent } = memory;
    if (outcome === undefined || sent === undefined) return undefined;
    if (!isDecisionOutcome(outcome) || !answers(outcome, sent)) return undefined;
    const lifted = freedRefusal(memory.refused, outcome, states);
    const refused = outcome.applied ? (lifted ? undefined : memory.refused) : outcome;
    return {
        memory: {
            ...pendingHandMerges(memory),
            latest: { outcome, acted: sent, ...(lifted ? { lifted } : {}) },
            ...(refused ? { refused } : {}),
            seen,
        },
        answer: "show",
    };
}

/** A newly seen finish of a merge by hand this pane asked for. */
function answerOwnHandMerge(
    memory: MergeOutcomeMemory,
    states: MergeOutcomeStates,
    seen: string,
): Answered | undefined {
    const outcome = states.lastOutcome;
    if (outcome === undefined || !isHandMergeOutcome(outcome)) return undefined;
    const request = memory.handMergesSent?.find(({ elementId }) => elementId === outcome.elementId);
    if (request === undefined) return undefined;
    const { sent, refused } = memory;
    return {
        memory: {
            ...(sent ? { sent } : {}),
            handMergesSent: withoutHandMerge(memory, outcome.elementId),
            latest: { outcome, acted: request },
            ...(refused ? { refused } : {}),
            seen,
        },
        answer: "show",
    };
}

/** Any other newly seen outcome is the partner's, newer than this pane's, which the pane forgets. */
function forgetForPartner(memory: MergeOutcomeMemory, seen: string): Answered {
    const { sent } = memory;
    return {
        memory: { ...(sent ? { sent } : {}), ...pendingHandMerges(memory), seen },
        answer: "forget",
    };
}

function pendingHandMerges(memory: MergeOutcomeMemory): Pick<MergeOutcomeMemory, "handMergesSent"> {
    return memory.handMergesSent ? { handMergesSent: memory.handMergesSent } : {};
}

function withoutHandMerge(
    memory: MergeOutcomeMemory,
    elementId: string,
): readonly MergeXmlRequest[] {
    return (memory.handMergesSent ?? []).filter((sent) => sent.elementId !== elementId);
}

/**
 * The outcome with the picks and the offer, which tell a partner's decision
 * from the last one where the outcome, which names no side, reads the same:
 * keeping the element again from the other side.
 */
function decisionsSeen(states: MergeOutcomeStates): string {
    const { lastOutcome, restoreOffer } = states;
    const picks = panePicks(states).map(({ id, pick: { keptSide, scope, mergedByHand } }) => [
        id,
        keptSide,
        scope,
        mergedByHand === true,
    ]);
    return JSON.stringify([lastOutcome ?? null, picks, restoreOffer ?? null]);
}

/** An outcome answers a decision of its element, an undo by an undo, a pick or leave-out by either. */
function answers(outcome: MergeDecisionOutcome, sent: MergeActedDecision): boolean {
    return (
        outcome.elementId === sent.elementId &&
        (outcome.action === "unpick") === (sent.kind === "undo")
    );
}

function freedRefusal(
    refused: MergeRefusal | undefined,
    outcome: MergeDecisionOutcome,
    states: MergeOutcomeStates,
): MergeRefusal | undefined {
    if (refused === undefined) return undefined;
    const pickedIds = new Set(panePicks(states).map(({ id }) => id));
    return refusalFreedBy(refused, outcome, pickedIds) ? refused : undefined;
}
