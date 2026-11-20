import type { MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import { type MergeOutcomeCardContent, withAnnouncement } from "./mergeCardContent";
import type { MergeDecisionOutcome, MergeRefusal } from "./mergeDecisionOutcome";
import {
    handMergeCardContent,
    type MergeHandMergeFacts,
    type MergeRememberedHandMerge,
} from "./mergeHandMergeCard";
import { dropAndResendText, handMergesAtStakeText, MERGE_XML_TEXTS } from "./mergeHandMergeTexts";
import {
    cardBlockText,
    MERGE_PICK_TEXTS,
    moreReasonsText,
    outcomeCardHeadline,
    restoreOfferText,
    unblockedText,
} from "./mergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

/** The host's outcome of a decision this pane sent, kept with that decision. */
interface MergeRememberedDecision {
    readonly outcome: MergeDecisionOutcome;
    readonly acted: MergeActedDecision;
    /** The refusal an undo freed: nothing that blocked it is left. */
    readonly freed?: MergeRefusal;
}

/** What the card or a row says of the pane's own latest request. */
export type MergeRememberedOutcome = MergeRememberedDecision | MergeRememberedHandMerge;

export function isRememberedHandMerge(
    remembered: MergeRememberedOutcome,
): remembered is MergeRememberedHandMerge {
    return remembered.acted.kind === "mergeXml";
}

const MAX_REASONS = 3;

const OUTCOME_ROWS = [
    { key: "pulledIn", label: MERGE_PICK_TEXTS.pulledIn },
    { key: "dropped", label: MERGE_PICK_TEXTS.dropped },
    { key: "reopened", label: MERGE_PICK_TEXTS.reopened },
] as const;

/**
 * The card for a decision this pane sent: a headline naming the side, then
 * what it changed and the offer of what the other side removed with it, or
 * up to three short reasons it was refused, and what an undo freed. A
 * decision that would drop versions merged by hand asks first; a merge by
 * hand says whether its text was taken ({@link handMergeCardContent}).
 */
export function mergeOutcomeCardContent(
    remembered: MergeRememberedOutcome,
    context: MergeOutcomeCardContext,
): MergeOutcomeCardContent {
    if (isRememberedHandMerge(remembered)) return handMergeCardContent(remembered, context);
    const { outcome, acted, freed } = remembered;
    const { restoreOffer, nameOf, translate } = context;
    const { elementId } = outcome;
    if (!outcome.applied && outcome.handMergesAtStake !== undefined) {
        return withAnnouncement({
            applied: false,
            notice: true,
            elementId,
            headline: handMergesAtStakeText(outcome.handMergesAtStake, nameOf, translate),
            rows: [],
            reasons: [],
            blockers: [],
            choices: [
                {
                    action: "dropHandMerges",
                    text: dropAndResendText(outcome.action, translate),
                    primary: true,
                },
                { action: "dismiss", text: translate(MERGE_XML_TEXTS.keepMine) },
            ],
        });
    }
    const headline = outcomeCardHeadline(outcome, acted, nameOf, translate);
    const unblocked =
        freed === undefined
            ? {}
            : {
                  unblocked: {
                      elementId: freed.elementId,
                      text: unblockedText(freed.action, nameOf(freed.elementId), translate),
                  },
              };
    if (!outcome.applied) {
        const hidden = outcome.blockedBy.length - MAX_REASONS;
        return withAnnouncement({
            applied: false,
            elementId,
            headline,
            rows: [],
            reasons: outcome.blockedBy
                .slice(0, MAX_REASONS)
                .map((block) => cardBlockText(block, elementId, nameOf, translate)),
            ...(hidden > 0 ? { moreReasons: moreReasonsText(hidden, translate) } : {}),
            blockers: blockersOf(outcome, elementId),
            ...unblocked,
        });
    }
    return withAnnouncement({
        applied: true,
        elementId,
        headline,
        // The headline names the element, so the rows list only the others.
        rows: OUTCOME_ROWS.map(({ key, label }) => ({
            label: translate(label),
            links: outcome[key]
                .filter((id) => id !== elementId)
                .map((id) => ({ elementId: id, name: nameOf(id) })),
        })).filter((row) => row.links.length > 0),
        reasons: [],
        blockers: [],
        ...(restoreOffer?.elementId === elementId
            ? { offer: { elementId, text: restoreOfferText(restoreOffer, translate) } }
            : {}),
        ...unblocked,
    });
}

/** What the card's words read besides the outcome. */
export interface MergeOutcomeCardContext {
    readonly restoreOffer?: MergePaneRestoreOffer;
    /** The pick of the element of a merge by hand, for its choices. */
    readonly handMerge?: MergeHandMergeFacts;
    readonly nameOf: (id: string) => string;
    readonly translate: MergeTranslate;
}

/**
 * What stands in the way of each reason: the element that needs the
 * decided one, or what the decided element itself needs.
 */
function blockersOf(refusal: MergeRefusal, elementId: string): readonly string[] {
    const blockers = refusal.blockedBy.map((block) =>
        block.elementId === elementId ? block.targetId : block.elementId,
    );
    return [...new Set(blockers.filter((id) => id !== elementId))];
}
