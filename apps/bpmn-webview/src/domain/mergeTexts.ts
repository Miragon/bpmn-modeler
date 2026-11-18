import type {
    MergePaneBuildNote,
    MergePaneContainerReach,
    MergeObstacleKind,
    MergeObstacleWithMissing,
    MergePaneAction,
    MergePaneBlock,
    MergePaneOtherSideLack,
    MergePaneOutcome,
    MergePaneRestoreOffer,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergeActedDecision } from "./mergeActedDecision";
import type { MergePadDecision } from "./mergePadDecisions";

/** `i18n.translate`, with the replacements its templates name. */
export type MergeTranslate = (key: string, replacements?: Record<string, string>) => string;

// The merge words the webview renders beside the bar's and its menu's (`mergeBarTexts`); each is a translation key.
const MERGE_SIDE_TEXTS: Record<MergeSide, string> = {
    current: "Current",
    incoming: "Incoming",
};

/** The word the panes' captions name `side` with. */
export function mergeSideText(side: MergeSide, translate: (key: string) => string): string {
    return translate(MERGE_SIDE_TEXTS[side]);
}

/** The canvas's conflict marker's badge. */
export const MERGE_MARK_TEXTS = {
    conflictBadge: "Conflict",
} as const;

/** The pick actions on the context pad and in the menu. */
export const MERGE_PICK_TEXTS = {
    keepInside: "Keep everything inside",
    undo: "Undo pick",
    pulledIn: "Pulled in:",
    dropped: "Dropped:",
    reopened: "Open again:",
} as const;

const KEEP_SIDE_TEXTS: Record<MergeSide, string> = {
    current: "Keep current",
    incoming: "Keep incoming",
};

const PICK_BADGE_LABELS: Record<MergePickScope, Record<MergeSide, string>> = {
    element: {
        current: "Kept from current, your pick",
        incoming: "Kept from incoming, your pick",
    },
    withContents: {
        current: "Kept from current with everything inside, your pick",
        incoming: "Kept from incoming with everything inside, your pick",
    },
    withConnections: {
        current: "Kept from current with its flows, your pick",
        incoming: "Kept from incoming with its flows, your pick",
    },
};

const RESTORE_OFFER_TEXTS: Record<
    MergeSide,
    { one: string; many: string; boundaryEvent: string; elements: string }
> = {
    current: {
        one: "Also keep the flow current removed with it",
        many: "Also keep the {count} flows current removed with it",
        boundaryEvent: "Also keep the boundary event current removed with it",
        elements: "Also keep the {count} elements current removed with it",
    },
    incoming: {
        one: "Also keep the flow incoming removed with it",
        many: "Also keep the {count} flows incoming removed with it",
        boundaryEvent: "Also keep the boundary event incoming removed with it",
        elements: "Also keep the {count} elements incoming removed with it",
    },
};

/** A pick's badge: the kept side's word as the pane captions name it, and its full words for screen readers. */
export function pickBadgeText(
    badge: { readonly keptSide: MergeSide; readonly scope: MergePickScope },
    translate: MergeTranslate,
): { side: string; label: string } {
    return {
        side: translate(MERGE_SIDE_TEXTS[badge.keptSide]),
        label: translate(PICK_BADGE_LABELS[badge.scope][badge.keptSide]),
    };
}

/** The action that keeps an element from `side`. */
export function keepSideText(side: MergeSide, translate: MergeTranslate): string {
    return translate(KEEP_SIDE_TEXTS[side]);
}

const KEEP_INSIDE_TEXTS: Record<MergeSide, string> = {
    current: "Keep current with everything inside",
    incoming: "Keep incoming with everything inside",
};

const KEEP_TIPS: Record<MergeSide, string> = {
    current: "Keep it as current has it",
    incoming: "Keep it as incoming has it",
};

// A collaboration's contents reach each pool's process, close to the whole model, which "everything inside" undersells.
const KEEP_INSIDE_TIPS: Record<MergePaneContainerReach, Record<MergeSide, string>> = {
    contents: {
        current: "Keep it and everything inside as current has them",
        incoming: "Keep it and everything inside as incoming has them",
    },
    poolProcesses: {
        current: "Keep it and every pool with its process as current has them",
        incoming: "Keep it and every pool with its process as incoming has them",
    },
};

const LEAVE_OUT_TIPS: Record<MergeSide, Record<MergePaneOtherSideLack, string>> = {
    current: {
        removed: "Leave it out, as current removed it",
        missing: "Leave it out, as current doesn't have it",
    },
    incoming: {
        removed: "Leave it out, as incoming removed it",
        missing: "Leave it out, as incoming doesn't have it",
    },
};

/** The action that keeps a container from `side` with everything inside. */
function keepInsideText(side: MergeSide, translate: MergeTranslate): string {
    return translate(KEEP_INSIDE_TEXTS[side]);
}

/** The context pad's words that name no side. */
export const MERGE_PAD_TEXTS = {
    leaveOut: "Leave out",
    keepRemovedFlows: "Also keep its removed flows",
    undoTip: "Go back to what the merge decided by itself",
} as const;

/**
 * A pad entry's words: its label for screen readers, which names the side
 * where the entry picks one, and its tooltip, the label and what it does,
 * for a keep with everything inside as far as it reaches.
 */
export function padDecisionText(
    decision: MergePadDecision,
    translate: MergeTranslate,
): { label: string; tooltip: string } {
    const withTip = (label: string, tip: string) => ({ label, tooltip: `${label}: ${tip}` });
    switch (decision.kind) {
        case "keep":
            return decision.scope === "withContents"
                ? withTip(
                      keepInsideText(decision.side, translate),
                      translate(KEEP_INSIDE_TIPS[decision.reach][decision.side]),
                  )
                : withTip(
                      keepSideText(decision.side, translate),
                      translate(KEEP_TIPS[decision.side]),
                  );
        case "leaveOut": {
            // "Leave out" names no side, so the label carries the tip too.
            const { tooltip } = withTip(
                translate(MERGE_PAD_TEXTS.leaveOut),
                translate(LEAVE_OUT_TIPS[decision.side][decision.otherSideLacks]),
            );
            return { label: tooltip, tooltip };
        }
        case "keepRemovedFlows":
            return withTip(
                translate(MERGE_PAD_TEXTS.keepRemovedFlows),
                restoreOfferText(decision.offer, translate),
            );
        case "undo":
            return withTip(translate(MERGE_PICK_TEXTS.undo), translate(MERGE_PAD_TEXTS.undoTip));
    }
}

/** The offer to keep the flows and boundary events the other side removed with an element the user kept. */
export function restoreOfferText(offer: MergePaneRestoreOffer, translate: MergeTranslate): string {
    const texts = RESTORE_OFFER_TEXTS[offer.removedBy];
    const boundaryEvents = offer.boundaryEvents?.length ?? 0;
    const count = offer.connections.length + boundaryEvents;
    if (boundaryEvents === 0) {
        return count === 1 ? translate(texts.one) : translate(texts.many, { count: String(count) });
    }
    return count === 1
        ? translate(texts.boundaryEvent)
        : translate(texts.elements, { count: String(count) });
}

const KEPT_HEADLINES: Record<MergePickScope, Record<MergeSide, string>> = {
    element: {
        current: "Kept from current: {element}",
        incoming: "Kept from incoming: {element}",
    },
    withContents: {
        current: "Kept from current with everything inside: {element}",
        incoming: "Kept from incoming with everything inside: {element}",
    },
    withConnections: {
        current: "Kept from current with its flows: {element}",
        incoming: "Kept from incoming with its flows: {element}",
    },
};

const LEFT_OUT_HEADLINES: Record<MergeSide, Record<MergePaneOtherSideLack, string>> = {
    current: {
        removed: "Left out: {element}, as current removed it",
        missing: "Left out: {element}, as current doesn't have it",
    },
    incoming: {
        removed: "Left out: {element}, as incoming removed it",
        missing: "Left out: {element}, as incoming doesn't have it",
    },
};

const REOPENED_HEADLINE = "Took back the pick. {element} is an open conflict again.";
const UNPICKED_HEADLINE = "Took back the pick of {element}";

const REFUSED_CARD_HEADLINES: Record<MergePaneAction, string> = {
    pick: "Can't keep {element}",
    leaveOut: "Can't leave out {element}",
    unpick: "Can't take back the pick of {element}",
};

const UNBLOCKED_TEXTS: Record<MergePaneAction, string> = {
    pick: "Nothing blocks keeping {element} now",
    leaveOut: "Nothing blocks leaving out {element} now",
    unpick: "Nothing blocks taking back the pick of {element} now",
};

/** A refusal's reason on the card, about an element other than the one the card is at. */
const CARD_OBSTACLE_TEXTS: Record<MergeObstacleKind, string> = {
    targetInNoVersion: "{element} needs {target}; no version has it",
    targetPickedWithout: "{element} needs {target}; your pick takes a side without it",
    targetDroppedByThisPick: "{element} needs {target}; this pick drops it",
    targetTakenByThisPickWithoutPart: "{element} needs a part of {target} this pick leaves out",
    sideLacksTarget: "{element} needs {target}; this side lacks it",
    targetNotInResult: "{element} needs {target}; the result leaves it out",
    targetTakenWithoutPart: "{element} needs a part of {target} the kept version lacks",
    dependentPicked: "Your pick of {element} needs {target}",
    dependentPulledInByThisPick: "This pick brings in {element}, which needs {target}",
    idHeldByAnother: "{element} and {target} hold the same ID",
    processInAnotherCollaboration: "{element} and {target} have a pool of the same process",
};

const CARD_MISSING_PART_TEXTS: Record<MergeObstacleWithMissing, string> = {
    targetPickedWithout: "{element} needs a part of {target}; your pick takes a side without it",
    sideLacksTarget: "{element} needs a part of {target}; this side lacks it",
};

/** The same reasons where the target is the element the card is at, which its headline names. */
const CARD_OBSTACLE_ON_IT_TEXTS: Record<MergeObstacleKind, string> = {
    targetInNoVersion: "{element} needs it; no version has it",
    targetPickedWithout: "{element} needs it; your pick takes a side without it",
    targetDroppedByThisPick: "{element} needs it",
    targetTakenByThisPickWithoutPart: "{element} needs a part of it this pick leaves out",
    sideLacksTarget: "{element} needs it; this side lacks it",
    targetNotInResult: "{element} needs it",
    targetTakenWithoutPart: "{element} needs a part of it the kept version lacks",
    dependentPicked: "Your pick of {element} needs it",
    dependentPulledInByThisPick: "This pick brings in {element}, which needs it",
    idHeldByAnother: "{element} holds the same ID",
    processInAnotherCollaboration: "{element} has a pool of the same process",
};

const CARD_MISSING_PART_ON_IT_TEXTS: Record<MergeObstacleWithMissing, string> = {
    targetPickedWithout: "{element} needs a part of it; your pick takes a side without it",
    sideLacksTarget: "{element} needs a part of it; this side lacks it",
};

/** The outcome card's own controls. */
export const MERGE_CARD_TEXTS = {
    close: "Close",
} as const;

/**
 * What a decision the pane sent did, as the card's headline: the side a
 * pick kept and how far, the side that lacks what a leave-out left out and
 * why, whether an undo opened the conflict again, or, refused, what could
 * not be done.
 */
export function outcomeCardHeadline(
    outcome: MergePaneOutcome,
    acted: MergeActedDecision,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const element = { element: nameOf(outcome.elementId) };
    if (!outcome.applied) return translate(REFUSED_CARD_HEADLINES[outcome.action], element);
    switch (acted.kind) {
        case "keep":
            return translate(KEPT_HEADLINES[acted.scope][acted.side], element);
        case "leaveOut":
            return translate(LEFT_OUT_HEADLINES[acted.side][acted.otherSideLacks], element);
        case "undo":
            return outcome.reopened.includes(outcome.elementId)
                ? translate(REOPENED_HEADLINE, element)
                : translate(UNPICKED_HEADLINE, element);
    }
}

/** One reason on the card, which says "it" for the element its headline names. */
export function cardBlockText(
    block: MergePaneBlock,
    cardElementId: string,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const onIt = block.targetId === cardElementId;
    const missingPart = "missing" in block && block.missing === "part";
    const template = missingPart
        ? (onIt ? CARD_MISSING_PART_ON_IT_TEXTS : CARD_MISSING_PART_TEXTS)[block.obstacle]
        : (onIt ? CARD_OBSTACLE_ON_IT_TEXTS : CARD_OBSTACLE_TEXTS)[block.obstacle];
    return translate(template, {
        element: nameOf(block.elementId),
        target: nameOf(block.targetId),
    });
}

/** The card's count of the reasons it does not list. */
export function moreReasonsText(count: number, translate: MergeTranslate): string {
    return translate("and {count} more", { count: String(count) });
}

/** What an undo lifted: the refused decision of `elementId` is free to go now. */
export function unblockedText(
    action: MergePaneAction,
    name: string,
    translate: MergeTranslate,
): string {
    return translate(UNBLOCKED_TEXTS[action], { element: name });
}

/** An unnamed flow, named by its ends. */
export function flowNameText(source: string, target: string, translate: MergeTranslate): string {
    return translate("Flow from {source} to {target}", { source, target });
}

/** The right pane's Build, and the notes' name. */
export const MERGE_BUILD_TEXTS = {
    build: "Build",
    notes: "Notes of the build",
} as const;

const COMPARE_WITH_TEXTS: Record<MergeSide, string> = {
    current: "Compare with current",
    incoming: "Compare with incoming",
};

const COMPARISON_TEXTS: Record<MergeSide, string> = {
    current: "Result against current",
    incoming: "Result against incoming",
};

/** What each build note asks the user to check, with the canvas's names of its elements. */
const BUILD_NOTE_TEXTS: Record<
    Exclude<MergePaneBuildNote["kind"], "layoutChangedByBoth">,
    string
> = {
    flowEndsFromDifferentSides:
        "{element} connects shapes drawn by different sides; check where it meets {ends}",
    addedAtSamePlace: "{first} and {second} were added at the same place",
    drawnApartFromContainer:
        "{element} is drawn by another side than {containers}; check that it still sits inside",
    restoredWithoutConnections:
        "{element} is kept without the flows the other side removed with it: {connections}",
    defaultFlowNotRestored: "{flow} is kept but is no longer the default flow of {element}",
    frameDiffers: "The file's {attribute} differs between the sides; current's is kept",
};

const OTHER_DEFAULT_KEPT_TEXT =
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow";

const LAYOUT_CHANGED_BY_BOTH_TEXTS: Record<MergeSide, string> = {
    current: "Both sides changed the layout of {elements}; current's is kept",
    incoming: "Both sides changed the layout of {elements}; incoming's is kept",
};

/** The menu's action that compares the built result with `side`. */
export function compareWithText(side: MergeSide, translate: MergeTranslate): string {
    return translate(COMPARE_WITH_TEXTS[side]);
}

/** What a result comparison's legend says it shows. */
export function comparisonText(side: MergeSide, translate: MergeTranslate): string {
    return translate(COMPARISON_TEXTS[side]);
}

const RESULT_TEXT = "Result";

/** A result comparison's pane label: the compared side on the left, the result on the right. */
export function comparisonPaneText(
    paneSide: DiffSide,
    against: MergeSide,
    translate: MergeTranslate,
): string {
    return translate(paneSide === "before" ? MERGE_SIDE_TEXTS[against] : RESULT_TEXT);
}

/** One note of the last build, in one line. */
export function buildNoteText(
    note: MergePaneBuildNote,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const names = (ids: readonly string[]) => ids.map(nameOf).join(", ");
    return translate(buildNoteTemplate(note), noteReplacements(note, nameOf, names));
}

function buildNoteTemplate(note: MergePaneBuildNote): string {
    if (note.kind === "layoutChangedByBoth") return LAYOUT_CHANGED_BY_BOTH_TEXTS[note.keptSide];
    if (note.kind === "defaultFlowNotRestored" && note.keptDefault !== undefined) {
        return OTHER_DEFAULT_KEPT_TEXT;
    }
    return BUILD_NOTE_TEXTS[note.kind];
}

function defaultFlowNoteReplacements(
    note: Extract<MergePaneBuildNote, { kind: "defaultFlowNotRestored" }>,
    nameOf: (id: string) => string,
): Record<string, string> {
    const replacements = { element: nameOf(note.id), flow: nameOf(note.flow) };
    return note.keptDefault === undefined
        ? replacements
        : { ...replacements, keptDefault: nameOf(note.keptDefault) };
}

function noteReplacements(
    note: MergePaneBuildNote,
    nameOf: (id: string) => string,
    names: (ids: readonly string[]) => string,
): Record<string, string> {
    switch (note.kind) {
        case "flowEndsFromDifferentSides":
            return { element: nameOf(note.id), ends: names(note.ends) };
        case "addedAtSamePlace":
            return { first: nameOf(note.ids[0] ?? ""), second: names(note.ids.slice(1)) };
        case "drawnApartFromContainer":
            return { element: nameOf(note.id), containers: names(note.containers) };
        case "restoredWithoutConnections":
            return { element: nameOf(note.id), connections: names(note.connections) };
        case "defaultFlowNotRestored":
            return defaultFlowNoteReplacements(note, nameOf);
        case "layoutChangedByBoth":
            return { elements: names(note.ids) };
        case "frameDiffers":
            return { attribute: note.attribute };
    }
}
