import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeXmlRequest } from "./mergeActedDecision";
import {
    type MergeCardChoice,
    type MergeOutcomeCardContent,
    withAnnouncement,
} from "./mergeCardContent";
import type { MergeHandMergeOutcome } from "./mergeDecisionOutcome";
import { type MergeElementPick, type MergePadOffers, offersMergeXml } from "./mergeElementPick";
import {
    handMergeHeadline,
    handMergeRefusalDetail,
    handMergeRefusalHeadline,
    keepVersionText,
    MERGE_XML_TEXTS,
} from "./mergeHandMergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

/** The host's answer to a merge by hand this pane asked for, kept with the request. */
export interface MergeRememberedHandMerge {
    readonly outcome: MergeHandMergeOutcome;
    readonly acted: MergeXmlRequest;
    /** No undo frees a merge by hand. */
    readonly lifted?: undefined;
}

/** What the card of a merge by hand reads of the element's pick. */
export interface MergeHandMergeFacts {
    /** The side the user's pick keeps; absent once nothing picks it. */
    readonly keptSide?: MergeSide;
    readonly mergedByHand: boolean;
    /** The pick still allows a merge by hand and the host offers the editor. */
    readonly canEditAgain: boolean;
}

/** The element's pick, and whether its XML can be merged again. */
export function handMergeFactsOf(
    element: MergeElementPick,
    offers: MergePadOffers,
): MergeHandMergeFacts {
    const { pick } = element;
    return {
        ...(pick === undefined ? {} : { keptSide: pick.keptSide }),
        mergedByHand: pick?.mergedByHand === true,
        canEditAgain: offersMergeXml(element, offers),
    };
}

/**
 * A merge by hand: taken, closed without a save, or refused with one
 * headline and one detail per kind, then Edit again while the pick allows
 * it and the choice to keep the version the element has.
 */
export function handMergeCardContent(
    { outcome }: MergeRememberedHandMerge,
    {
        handMerge,
        nameOf,
        translate,
    }: {
        readonly handMerge?: MergeHandMergeFacts;
        readonly nameOf: (id: string) => string;
        readonly translate: MergeTranslate;
    },
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
