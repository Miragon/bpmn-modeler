import type {
    MergePaneHandMergeRefusal,
    MergePanePickAction,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeXmlDecision } from "./mergePadDecisions";
import type { MergeTranslate } from "./mergeTranslate";

// The words of merging an element's XML by hand: the pad entry, the badge and the card; each is a translation key.

/** The words that name no side. */
export const MERGE_XML_TEXTS = {
    byHand: "by hand",
    editAgain: "Edit again",
    keepMine: "Keep my XML",
    keepMergedBefore: "Keep the XML merged before",
} as const;

const MERGE_XML_DECISION_TEXTS: Record<
    MergeXmlDecision["mode"],
    { readonly label: string; readonly tip: string }
> = {
    open: {
        label: "Merge XML",
        tip: "Merge both sides' changes to its XML by hand in a merge editor",
    },
    edit: { label: "Edit merged XML", tip: "Change the XML you merged by hand" },
};

const KEEP_VERSION_TEXTS: Record<MergeSide, string> = {
    current: "Keep current's version",
    incoming: "Keep incoming's version",
};

const DROP_AND_RESEND_TEXTS: Record<MergePanePickAction, string> = {
    pick: "Drop it and pick",
    leaveOut: "Drop it and leave out",
    unpick: "Drop it and undo",
};

const BY_HAND_BADGE_LABELS: Record<MergePickScope, Record<MergeSide, string>> = {
    element: {
        current: "Kept from current and merged by hand, your pick",
        incoming: "Kept from incoming and merged by hand, your pick",
    },
    withContents: {
        current: "Kept from current with everything inside and merged by hand, your pick",
        incoming: "Kept from incoming with everything inside and merged by hand, your pick",
    },
    withRemoved: {
        current: "Kept from current with what was removed with it and merged by hand, your pick",
        incoming: "Kept from incoming with what was removed with it and merged by hand, your pick",
    },
};

const ACCEPTED_HEADLINE = "Merged by hand: {element}";
const DISCARDED_HEADLINE = "Closed without saving: {element} is unchanged";
const AT_STAKE_HEADLINE = "This drops the XML you merged by hand for {elements}";

const REFUSAL_HEADLINES: Record<MergePaneHandMergeRefusal["kind"], string> = {
    conflictMarkersLeft: "The XML of {element} still holds conflict markers",
    unparsable: "The XML of {element} doesn't parse",
    notOneElement: "The XML of {element} must hold one element",
    typeChanged: "The XML of {element} changes its type",
    idChanged: "The XML of {element} changes its ID",
    holdsElementsOfTheirOwn: "The XML of {element} holds elements of their own",
    beyondOwnAttributes: "The XML of {element} goes beyond its own content",
    namesWrongType: "The XML of {element} names an element of the wrong type",
    unknownNamespace: "The XML of {element} uses an unknown namespace",
    rejectedByEngine: "The engine doesn't take the XML of {element}",
    changesStructure: "The XML of {element} changes what follows the pick",
    namesMissingElement: "The XML of {element} names an element no version has",
    namesLeftOutElement: "The XML of {element} names an element the result leaves out",
    changesOtherDecisions: "The XML of {element} would change other decisions",
    notHandMergeable: "The pick of {element} changed while you merged it",
};

const REFUSAL_DETAILS = {
    conflictMarkersLeft: "Resolve each conflict and remove its markers, then save.",
    unparsable: "The parser says: {detail}",
    notOneElement: "It holds {count} elements at its top level.",
    typeChanged: "It is a {found} now; keep it a {expected}.",
    idChanged: "Its ID is {found} now; keep {expected}.",
    idRemoved: "It has no ID now; keep {expected}.",
    holdsElementsOfTheirOwn: "Merge these on their own, with a pick: {elements}",
    beyondOwnAttributes:
        "Only its attributes, documentation and extension elements merge here, not {properties}.",
    wrongTypeReference: "{target} as {property}, which takes a {expected}",
    unknownNamespace: "No version declares {namespaces}.",
    rejectedByEngine: "The engine says: {detail}",
    changesStructure: "{properties} follow the side you picked.",
    namesMissingElement: "No version has {elements}.",
    namesLeftOutElement: "The result leaves out {elements}.",
    changesOtherDecisions: "It would change the decisions on {elements}.",
    notHandMergeable: "It is no longer picked on the side you merged it for.",
} as const;

/** The pad entry's and the row button's words: its label, and its tooltip, the label and what it does. */
export function mergeXmlDecisionText(
    decision: MergeXmlDecision,
    translate: MergeTranslate,
): { label: string; tooltip: string } {
    const { label, tip } = MERGE_XML_DECISION_TEXTS[decision.mode];
    const translated = translate(label);
    return { label: translated, tooltip: `${translated}: ${translate(tip)}` };
}

/** A badge's full words for a version merged by hand, which name the kept side. */
export function byHandBadgeLabel(
    scope: MergePickScope,
    side: MergeSide,
    translate: MergeTranslate,
): string {
    return translate(BY_HAND_BADGE_LABELS[scope][side]);
}

/** Closes a refusal's card, keeping the pick's own version of the element. */
export function keepVersionText(side: MergeSide, translate: MergeTranslate): string {
    return translate(KEEP_VERSION_TEXTS[side]);
}

/** Sends the decision again, agreeing to drop the XML merged by hand. */
export function dropAndResendText(action: MergePanePickAction, translate: MergeTranslate): string {
    return translate(DROP_AND_RESEND_TEXTS[action]);
}

/** The question a decision that would drop versions merged by hand asks. */
export function handMergesAtStakeText(
    ids: readonly string[],
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    return translate(AT_STAKE_HEADLINE, { elements: ids.map(nameOf).join(", ") });
}

/** The headline of a taken merge, or of one closed without a save. */
export function handMergeHeadline(
    finish: "accepted" | "discarded",
    element: string,
    translate: MergeTranslate,
): string {
    return translate(finish === "accepted" ? ACCEPTED_HEADLINE : DISCARDED_HEADLINE, { element });
}

/** What the merge did not take, as one headline per kind. */
export function handMergeRefusalHeadline(
    refusal: MergePaneHandMergeRefusal,
    element: string,
    translate: MergeTranslate,
): string {
    return translate(REFUSAL_HEADLINES[refusal.kind], { element });
}

/** What to change, worded from the refusal's data; elements by the pane's names. */
export function handMergeRefusalDetail(
    refusal: MergePaneHandMergeRefusal,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const list = (items: readonly string[]) => items.join(", ");
    const elements = (ids: readonly string[]) => list(ids.map(nameOf));
    switch (refusal.kind) {
        case "conflictMarkersLeft":
        case "notHandMergeable":
            return translate(REFUSAL_DETAILS[refusal.kind]);
        case "unparsable":
        case "rejectedByEngine":
            return translate(REFUSAL_DETAILS[refusal.kind], { detail: refusal.detail });
        case "notOneElement":
            return translate(REFUSAL_DETAILS.notOneElement, { count: String(refusal.found) });
        case "typeChanged":
            return translate(REFUSAL_DETAILS.typeChanged, {
                found: refusal.found,
                expected: refusal.expected,
            });
        case "idChanged":
            return refusal.found === undefined
                ? translate(REFUSAL_DETAILS.idRemoved, { expected: refusal.expected })
                : translate(REFUSAL_DETAILS.idChanged, {
                      found: refusal.found,
                      expected: refusal.expected,
                  });
        case "holdsElementsOfTheirOwn":
        case "namesMissingElement":
        case "namesLeftOutElement":
        case "changesOtherDecisions":
            return translate(REFUSAL_DETAILS[refusal.kind], { elements: elements(refusal.ids) });
        case "beyondOwnAttributes":
        case "changesStructure":
            return translate(REFUSAL_DETAILS[refusal.kind], {
                properties: list(refusal.properties),
            });
        case "unknownNamespace":
            return translate(REFUSAL_DETAILS.unknownNamespace, {
                namespaces: list(refusal.namespaces),
            });
        case "namesWrongType":
            return refusal.references
                .map(({ property, target, expected }) =>
                    translate(REFUSAL_DETAILS.wrongTypeReference, {
                        target: nameOf(target),
                        property,
                        expected,
                    }),
                )
                .join("; ");
    }
}
