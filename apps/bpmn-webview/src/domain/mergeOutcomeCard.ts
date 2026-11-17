import type { MergePaneOutcome, MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import type { MergeActedDecision } from "./mergeActedDecision";
import {
    cardBlockText,
    MERGE_PICK_TEXTS,
    moreReasonsText,
    type MergeTranslate,
    outcomeCardHeadline,
    restoreOfferText,
    unblockedText,
} from "./mergeTexts";

/** A decision the host refused, with what blocked it. */
export type MergeRefusal = Extract<MergePaneOutcome, { applied: false }>;

/** The host's outcome of a decision this pane sent, kept with that decision. */
export interface MergeRememberedOutcome {
    readonly outcome: MergePaneOutcome;
    readonly acted: MergeActedDecision;
    /** The refusal an undo freed: nothing that blocked it is left. */
    readonly lifted?: MergeRefusal;
}

/** An element the card names, as a link that shows it. */
interface MergeOutcomeCardLink {
    readonly elementId: string;
    readonly name: string;
}

/** What the outcome card at an element says; the adapter only renders it. */
export interface MergeOutcomeCardContent {
    readonly applied: boolean;
    readonly elementId: string;
    readonly headline: string;
    /** What the decision pulled in, dropped and opened again. */
    readonly rows: readonly {
        readonly label: string;
        readonly links: readonly MergeOutcomeCardLink[];
    }[];
    readonly reasons: readonly string[];
    readonly moreReasons?: string;
    /** What blocks a refusal, which the canvas marks while the card shows. */
    readonly blockers: readonly string[];
    readonly offer?: { readonly elementId: string; readonly text: string };
    readonly unblocked?: { readonly elementId: string; readonly text: string };
    /** The lines a screen reader announces once, when the outcome arrives. */
    readonly announcement: readonly string[];
}

const MAX_REASONS = 3;

const OUTCOME_ROWS = [
    { key: "pulledIn", label: MERGE_PICK_TEXTS.pulledIn },
    { key: "dropped", label: MERGE_PICK_TEXTS.dropped },
    { key: "reopened", label: MERGE_PICK_TEXTS.reopened },
] as const;

/**
 * The card for a decision this pane sent: a headline naming the side, then
 * what it changed and the offer of the flows the other side removed, or up
 * to three short reasons it was refused, and what an undo freed.
 */
export function mergeOutcomeCardContent(
    remembered: MergeRememberedOutcome,
    context: {
        readonly restoreOffer?: MergePaneRestoreOffer;
        readonly nameOf: (id: string) => string;
        readonly translate: MergeTranslate;
    },
): MergeOutcomeCardContent {
    const { outcome, acted, lifted } = remembered;
    const { restoreOffer, nameOf, translate } = context;
    const { elementId } = outcome;
    const headline = outcomeCardHeadline(outcome, acted, nameOf, translate);
    const unblocked =
        lifted === undefined
            ? {}
            : {
                  unblocked: {
                      elementId: lifted.elementId,
                      text: unblockedText(lifted.action, nameOf(lifted.elementId), translate),
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

/** The card says it all but the offer, which is a control, not news. */
function withAnnouncement(
    content: Omit<MergeOutcomeCardContent, "announcement">,
): MergeOutcomeCardContent {
    const announcement = [
        content.headline,
        ...content.rows.map(
            ({ label, links }) => `${label} ${links.map(({ name }) => name).join(", ")}`,
        ),
        ...content.reasons,
        content.moreReasons,
        content.unblocked?.text,
    ].filter((line): line is string => line !== undefined);
    return { ...content, announcement };
}
