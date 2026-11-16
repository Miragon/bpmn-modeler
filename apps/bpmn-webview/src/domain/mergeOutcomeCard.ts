import type { MergePaneOutcome, MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import {
    blockText,
    MERGE_PICK_TEXTS,
    moreReasonsText,
    type MergeTranslate,
    outcomeCardHeadline,
    restoreOfferText,
} from "./mergeTexts";
import type { MergeActedDecision } from "./mergeActedDecision";

/** One row of the card: what the decision pulled in, dropped or opened again. */
export interface MergeOutcomeCardRow {
    readonly label: string;
    readonly elementIds: readonly string[];
}

/** What the outcome card at an element says; the adapter only renders it. */
export interface MergeOutcomeCardContent {
    readonly applied: boolean;
    readonly elementId: string;
    readonly headline: string;
    readonly rows: readonly MergeOutcomeCardRow[];
    readonly reasons: readonly string[];
    readonly moreReasons?: string;
    /** The elements whose state refused the decision, which the pane marks while the card shows. */
    readonly blockers: readonly string[];
    readonly offer?: { readonly elementId: string; readonly text: string };
}

const MAX_REASONS = 3;

const OUTCOME_ROWS = [
    { key: "pulledIn", label: MERGE_PICK_TEXTS.pulledIn },
    { key: "dropped", label: MERGE_PICK_TEXTS.dropped },
    { key: "reopened", label: MERGE_PICK_TEXTS.reopened },
] as const;

/**
 * Whether the host's last outcome answers the decision this pane sent: the
 * same element, and an undo for an undo, a pick or leave-out for a pick.
 */
export function answersActedDecision(
    outcome: MergePaneOutcome | undefined,
    acted: MergeActedDecision | undefined,
): outcome is MergePaneOutcome {
    if (outcome === undefined || acted === undefined) return false;
    if (outcome.elementId !== acted.elementId) return false;
    return (outcome.action === "unpick") === (acted.action === "unpick");
}

/**
 * The card for the outcome of the decision this pane sent: a headline that
 * names the side, the elements it pulled in, dropped or opened again, or up
 * to three reasons it was refused, and the offer to keep the flows removed
 * with the element when the host made one.
 */
export function mergeOutcomeCardContent(
    outcome: MergePaneOutcome,
    acted: MergeActedDecision,
    restoreOffer: MergePaneRestoreOffer | undefined,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): MergeOutcomeCardContent {
    const headline = outcomeCardHeadline(outcome, acted, nameOf, translate);
    const offer =
        restoreOffer?.elementId === outcome.elementId
            ? { elementId: restoreOffer.elementId, text: restoreOfferText(restoreOffer, translate) }
            : undefined;
    if (outcome.applied) {
        return {
            applied: true,
            elementId: outcome.elementId,
            headline,
            // The headline names the element itself, so its rows list only the others.
            rows: OUTCOME_ROWS.map(({ key, label }) => ({
                label: translate(label),
                elementIds: outcome[key].filter((id) => id !== outcome.elementId),
            })).filter(({ elementIds }) => elementIds.length > 0),
            reasons: [],
            blockers: [],
            ...(offer === undefined ? {} : { offer }),
        };
    }
    const hidden = outcome.blockedBy.length - MAX_REASONS;
    return {
        applied: false,
        elementId: outcome.elementId,
        headline,
        rows: [],
        reasons: outcome.blockedBy
            .slice(0, MAX_REASONS)
            .map((block) => blockText(block, nameOf, translate)),
        ...(hidden > 0 ? { moreReasons: moreReasonsText(hidden, translate) } : {}),
        blockers: [
            ...new Set(
                outcome.blockedBy
                    .map(({ elementId }) => elementId)
                    .filter((id) => id !== outcome.elementId),
            ),
        ],
    };
}

/** The card in one line, for a shape-less row that has no element to put the card at. */
export function mergeOutcomeLine(content: MergeOutcomeCardContent): string {
    const [firstReason] = content.reasons;
    return firstReason === undefined ? content.headline : `${content.headline}: ${firstReason}`;
}
