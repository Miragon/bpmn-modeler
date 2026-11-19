import type { MergePaneRestoreOffer, MergePaneStates } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeActedDecision, MergeXmlRequest } from "./mergeActedDecision";
import type {
    MergeDecisionOutcome,
    MergeHandMergeOutcome,
    MergeRefusal,
} from "./mergeDecisionOutcome";
import {
    dropAndResendText,
    handMergeHeadline,
    handMergeRefusalDetail,
    handMergeRefusalHeadline,
    handMergesAtStakeText,
    keepVersionText,
    MERGE_XML_TEXTS,
} from "./mergeHandMergeTexts";
import type { MergePadOffers } from "./mergePadDecisions";
import { cardBlockText, MERGE_PICK_TEXTS, moreReasonsText, outcomeCardHeadline, restoreOfferText, unblockedText } from "./mergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

/** The host's outcome of a decision this pane sent, kept with that decision. */
interface MergeRememberedDecision {
    readonly outcome: MergeDecisionOutcome;
    readonly acted: MergeActedDecision;
    /** The refusal an undo freed: nothing that blocked it is left. */
    readonly lifted?: MergeRefusal;
}

/** The host's answer to a merge by hand this pane asked for, kept with the request. */
export interface MergeRememberedHandMerge {
    readonly outcome: MergeHandMergeOutcome;
    readonly acted: MergeXmlRequest;
    /** No undo frees a merge by hand. */
    readonly lifted?: undefined;
}

/** What the card or a row says of the pane's own latest request. */
export type MergeRememberedOutcome = MergeRememberedDecision | MergeRememberedHandMerge;

export function isRememberedHandMerge(
    remembered: MergeRememberedOutcome,
): remembered is MergeRememberedHandMerge {
    return remembered.acted.kind === "mergeXml";
}

/** What a card's choice does: open the merge editor again, resend dropping the merges by hand, or close the card. */
export type MergeCardAction = "editAgain" | "dropHandMerges" | "dismiss";

/** A worded button of the card, the first one primary. */
export interface MergeCardChoice {
    readonly action: MergeCardAction;
    readonly text: string;
    readonly primary?: true;
}

/** What the card of a merge by hand reads of the element's pick. */
export interface MergeHandMergeFacts {
    /** The side the user's pick keeps; absent once nothing picks it. */
    readonly keptSide?: MergeSide;
    readonly mergedByHand: boolean;
    /** The pick still allows a merge by hand and the host offers the editor. */
    readonly canEditAgain: boolean;
}

/** What {@link handMergeFactsOf} reads of the host's states. */
export type MergeHandMergeStates = Pick<
    MergePaneStates,
    "pickable" | "badges" | "picksNotDrawn" | "shapelessRows"
>;

/** The user's pick of `elementId` as the panes show it, and whether its XML can be merged again. */
export function handMergeFactsOf(
    states: MergeHandMergeStates,
    offers: MergePadOffers,
    elementId: string,
): MergeHandMergeFacts {
    const picks = [
        ...states.badges,
        ...states.picksNotDrawn,
        ...states.shapelessRows.flatMap((row) => (row.pick ? [{ id: row.id, ...row.pick }] : [])),
    ];
    const pick = picks.find(({ id }) => id === elementId);
    const handMergeable = [...states.pickable, ...states.shapelessRows].some(
        (element) => element.id === elementId && element.handMergeable === true,
    );
    return {
        ...(pick === undefined ? {} : { keptSide: pick.keptSide }),
        mergedByHand: pick?.mergedByHand === true,
        canEditAgain: handMergeable && offers.elementXmlMerge,
    };
}

/** An element the card names, as a link that shows it. */
interface MergeOutcomeCardLink {
    readonly elementId: string;
    readonly name: string;
}

/** What the outcome card at an element says; the adapter only renders it. */
export interface MergeOutcomeCardContent {
    readonly applied: boolean;
    /** Neither taken nor refused: a merge closed without a save, or a question. */
    readonly notice?: true;
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
    readonly choices?: readonly MergeCardChoice[];
    /** The lines a screen reader announces once, when the outcome arrives. */
    readonly announcement: readonly string[];
}

/** How the card reads: taken, refused, or neither, such as a question; only a refusal is an alert. */
export type MergeCardTone = "applied" | "refused" | "notice";

export function cardToneOf(
    content: Pick<MergeOutcomeCardContent, "applied" | "notice">,
): MergeCardTone {
    if (content.applied) return "applied";
    return content.notice ? "notice" : "refused";
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
    const { outcome, acted, lifted } = remembered;
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

/** What the card's words read besides the outcome. */
export interface MergeOutcomeCardContext {
    readonly restoreOffer?: MergePaneRestoreOffer;
    /** The pick of the element of a merge by hand, for its choices. */
    readonly handMerge?: MergeHandMergeFacts;
    readonly nameOf: (id: string) => string;
    readonly translate: MergeTranslate;
}

/**
 * A merge by hand: taken, closed without a save, or refused with one
 * headline and one detail per kind, then Edit again while the pick allows
 * it and the choice to keep the version the element has.
 */
function handMergeCardContent(
    { outcome }: MergeRememberedHandMerge,
    { handMerge, nameOf, translate }: MergeOutcomeCardContext,
): MergeOutcomeCardContent {
    const { elementId } = outcome;
    const element = nameOf(elementId);
    const plain = { elementId, rows: [], reasons: [], blockers: [] };
    if (outcome.applied) {
        return withAnnouncement({
            ...plain,
            applied: true,
            headline: handMergeHeadline("accepted", element, translate),
        });
    }
    const refusal = outcome.handMergeRefusal;
    if (refusal === undefined) {
        return withAnnouncement({
            ...plain,
            applied: false,
            notice: true,
            headline: handMergeHeadline("discarded", element, translate),
        });
    }
    const choices: MergeCardChoice[] = [];
    if (handMerge?.canEditAgain) {
        choices.push({
            action: "editAgain",
            text: translate(MERGE_XML_TEXTS.editAgain),
            primary: true,
        });
    }
    if (handMerge?.keptSide !== undefined) {
        choices.push({
            action: "dismiss",
            text: handMerge.mergedByHand
                ? translate(MERGE_XML_TEXTS.keepMergedBefore)
                : keepVersionText(handMerge.keptSide, translate),
        });
    }
    return withAnnouncement({
        ...plain,
        applied: false,
        headline: handMergeRefusalHeadline(refusal, element, translate),
        reasons: [handMergeRefusalDetail(refusal, nameOf, translate)],
        choices,
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
