import { elementTypeName } from "@miragon/bpmn-modeler-element-template-builder";
import type {
    MergePaneBuildNote,
    MergeObstacleKind,
    MergeObstacleWithMissing,
    MergePaneAction,
    MergePaneBlock,
    MergePaneOutcome,
    MergePaneRestoreOffer,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type {
    DiffSide,
    MergeCaptionRole,
    MergeMarker,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

import type { MergeActedDecision } from "./mergeOutcomeCard";
import type { MergePadDecision } from "./mergePadDecisions";

/** `i18n.translate`, with the replacements its templates name. */
export type MergeTranslate = (key: string, replacements?: Record<string, string>) => string;

// The one home of every merge word the webview renders; each is a translation key.
const MERGE_SIDE_TEXTS: Record<MergeSide, string> = {
    current: "Current",
    incoming: "Incoming",
};

const MERGE_ROLE_TEXTS: Record<MergeCaptionRole, string | undefined> = {
    branch: "your branch",
    upstream: "other branch",
    yourCommit: "your commit",
    stash: "your stash",
    unknown: undefined,
};

/**
 * A merge pane's label: its side, what the side is to the user, and the
 * branch and commit it shows (`Current: your branch main · 1a2b3c4`). Branch
 * names and hashes stay as Git wrote them.
 */
export function mergeCaptionText(
    caption: MergeSideCaption,
    translate: (key: string) => string,
): string {
    const { side, detail } = mergeCaptionParts(caption, translate);
    return detail === undefined ? side : `${side}: ${detail}`;
}

/** The caption's side word and the rest, so a narrow pane can show the side word alone. */
export function mergeCaptionParts(
    caption: MergeSideCaption,
    translate: (key: string) => string,
): { readonly side: string; readonly detail?: string } {
    const role = MERGE_ROLE_TEXTS[caption.role];
    const name = [role === undefined ? undefined : translate(role), caption.ref]
        .filter((part) => part !== undefined)
        .join(" ");
    const detail = [name, caption.shortHash].filter((part) => part).join(" · ");
    const side = translate(MERGE_SIDE_TEXTS[caption.side]);
    return detail === "" ? { side } : { side, detail };
}

/** What each marker means on the pane that shows it. */
export const MERGE_MARKER_LABELS: Readonly<Record<MergeMarker, string>> = {
    takenFromThisSide: "Taken from this side",
    takenFromOtherSide: "Taken from the other side",
    conflict: "Conflict",
};

/** The merge legend's own controls. */
export const MERGE_LEGEND_TEXTS = {
    stepList: "Step through",
    openConflictSteps: "Open conflicts",
    allSteps: "All merged elements",
    shapeless: "Without a shape",
    conflictBadge: "Conflict",
} as const;

/** The legend's count of the conflicts left to decide. */
export function openConflictsText(count: number, translate: MergeTranslate): string {
    if (count === 0) return translate("No open conflicts");
    if (count === 1) return translate("1 open conflict");
    return translate("{count} open conflicts", { count: String(count) });
}

/**
 * A shape-less element's entry in the legend: its name, or its id where it has
 * none, and its type in words (`Data store`).
 */
export function shapelessEntryText(
    entry: { readonly id: string; readonly type: string; readonly name?: string },
    translate: MergeTranslate,
): string {
    return `${entry.name ?? entry.id} (${elementTypeName(entry.type, translate)})`;
}

/**
 * The merge bar's "…" menu and its tooltips. English only for now: the
 * catalogs fall back to the key until they translate them.
 */
export const MERGE_MENU_TEXTS = {
    more: "More merge actions",
    shapelessInfo: "What is this list?",
    shapelessInfoTip:
        "Changes you can't click in the diagram: errors, messages, signals and other definitions have no shape. Decide them in this list.",
    close: "Close",
} as const;

/** The heading of the menu's list of the marked elements no canvas draws. */
export function shapelessHeadingText(count: number, translate: MergeTranslate): string {
    return translate("Not visible in the diagram ({count})", { count: String(count) });
}

/** What the count badge on the "…" button stands for. */
export function openShapelessConflictsText(count: number, translate: MergeTranslate): string {
    return count === 1
        ? translate("1 open conflict not visible in the diagram")
        : translate("{count} open conflicts not visible in the diagram", {
              count: String(count),
          });
}

/** The pick actions on the context pad and in the legend. */
export const MERGE_PICK_TEXTS = {
    keepThis: "Keep this version",
    keepInside: "Keep everything inside",
    undo: "Undo pick",
    yourPicks: "Your picks",
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

const PICK_NOT_DRAWN_TEXTS: Record<MergeSide, string> = {
    current: "Kept from current: {element}",
    incoming: "Kept from incoming: {element}",
};

/** Why a pick was refused, in the merge's terms, with the two elements' names. */
const MERGE_OBSTACLE_TEXTS: Record<MergeObstacleKind, string> = {
    targetInNoVersion: "{element} needs {target}, which no version has",
    targetPickedWithout: "{element} needs {target}, which you picked from a side without it",
    targetDroppedByThisPick: "{element} needs {target}, which this pick drops",
    targetTakenByThisPickWithoutPart:
        "{element} needs a part of {target} that this pick leaves out",
    sideLacksTarget: "{element} needs {target}, which this side does not have",
    targetNotInResult: "{element} needs {target}, which the result leaves out",
    targetTakenWithoutPart: "{element} needs a part of {target} that the kept version lacks",
    dependentPicked: "{element}, which you picked, needs {target}",
    dependentPulledInByThisPick: "This pick brings in {element}, which needs {target}",
    idHeldByAnother: "{element} and {target} hold the same ID",
    processInAnotherCollaboration: "{element} and {target} each have a pool of the same process",
};

/** The same reasons where the element misses only a part inside the target. */
const MISSING_PART_TEXTS: Record<MergeObstacleWithMissing, string> = {
    targetPickedWithout:
        "{element} needs a part of {target}, which you picked from a side without it",
    sideLacksTarget: "{element} needs a part of {target} that this side does not have",
};

const RESTORE_OFFER_TEXTS: Record<MergeSide, { one: string; many: string }> = {
    current: {
        one: "Also keep the flow current removed with it",
        many: "Also keep the {count} flows current removed with it",
    },
    incoming: {
        one: "Also keep the flow incoming removed with it",
        many: "Also keep the {count} flows incoming removed with it",
    },
};

const OUTCOME_HEADLINES: Record<MergePaneAction, { applied: string; refused: string }> = {
    pick: { applied: "Kept {element}", refused: "Cannot keep {element}" },
    leaveOut: { applied: "Left out {element}", refused: "Cannot leave out {element}" },
    unpick: {
        applied: "Took back the pick of {element}",
        refused: "Cannot take back the pick of {element}",
    },
};

/** A pick's badge: the kept side's word, as the pane captions name it, and its full words for the title and screen readers. */
export function pickBadgeText(
    badge: { readonly keptSide: MergeSide; readonly scope: MergePickScope },
    translate: MergeTranslate,
): { side: string; label: string } {
    return {
        side: translate(MERGE_SIDE_TEXTS[badge.keptSide]),
        label: translate(PICK_BADGE_LABELS[badge.scope][badge.keptSide]),
    };
}

/** A pick the pane cannot draw, as its legend lists it. */
export function pickNotDrawnText(
    keptSide: MergeSide,
    name: string,
    translate: MergeTranslate,
): string {
    return translate(PICK_NOT_DRAWN_TEXTS[keptSide], { element: name });
}

/** The legend's action that keeps the stepped element from the pane's side. */
export function keepSideText(side: MergeSide, translate: MergeTranslate): string {
    return translate(KEEP_SIDE_TEXTS[side]);
}

/** One reason a pick was refused, naming the elements as the canvas does. */
export function blockText(
    block: MergePaneBlock,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const template =
        "missing" in block && block.missing === "part"
            ? MISSING_PART_TEXTS[block.obstacle]
            : MERGE_OBSTACLE_TEXTS[block.obstacle];
    return translate(template, {
        element: nameOf(block.elementId),
        target: nameOf(block.targetId),
    });
}

/** The offer to keep the flows the other side removed with an element the user kept. */
export function restoreOfferText(offer: MergePaneRestoreOffer, translate: MergeTranslate): string {
    const texts = RESTORE_OFFER_TEXTS[offer.removedBy];
    return offer.connections.length === 1
        ? translate(texts.one)
        : translate(texts.many, { count: String(offer.connections.length) });
}

/** What the user's last pick or undo did, in one line. */
export function outcomeHeadline(
    outcome: MergePaneOutcome,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const headlines = OUTCOME_HEADLINES[outcome.action];
    return translate(outcome.applied ? headlines.applied : headlines.refused, {
        element: nameOf(outcome.elementId),
    });
}

/** The build part of the merge legend, and the notes list's name. */
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
const BUILD_NOTE_TEXTS: Record<MergePaneBuildNote["kind"], string> = {
    flowEndsFromDifferentSides:
        "{element} connects shapes drawn by different sides; check where it meets {ends}",
    addedAtSamePlace: "{first} and {second} were added at the same place",
    drawnApartFromContainer:
        "{element} is drawn by another side than {containers}; check that it still sits inside",
    restoredWithoutConnections:
        "{element} is kept without the flows the other side removed with it: {connections}",
    frameDiffers: "The file's {attribute} differs between the sides; current's is kept",
};

/** Why Build is disabled. */
export function buildBlockedText(count: number, translate: MergeTranslate): string {
    return count === 1
        ? translate("1 conflict left")
        : translate("{count} conflicts left", { count: String(count) });
}

/** The legend's action that compares the built result with `side`. */
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

export function reviewNotesText(count: number, translate: MergeTranslate): string {
    return translate("Review notes ({count})", { count: String(count) });
}

/** One note of the last build, in one line. */
export function buildNoteText(
    note: MergePaneBuildNote,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const names = (ids: readonly string[]) => ids.map(nameOf).join(", ");
    return translate(BUILD_NOTE_TEXTS[note.kind], noteReplacements(note, nameOf, names));
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
        case "frameDiffers":
            return { attribute: note.attribute };
    }
}

// ─── Pad and outcome card (spike: English only, the catalogs fall back to the key) ───

/** What a decision on the context pad says: its label in the worded pad, and its tooltip. */
export interface MergePadDecisionText {
    readonly label: string;
    readonly tip: string;
}

const KEEP_INSIDE_TEXTS: Record<MergeSide, string> = {
    current: "Keep current with everything inside",
    incoming: "Keep incoming with everything inside",
};

const KEEP_TIPS: Record<MergeSide, string> = {
    current: "Keep it as current has it",
    incoming: "Keep it as incoming has it",
};

const KEEP_INSIDE_TIPS: Record<MergeSide, string> = {
    current: "Keep it and everything inside as current has them",
    incoming: "Keep it and everything inside as incoming has them",
};

const LEAVE_OUT_TIPS: Record<MergeSide, string> = {
    current: "Leave it out, as current removed it",
    incoming: "Leave it out, as incoming removed it",
};

/** The context pad's words; the side-naming ones are records above. */
export const MERGE_PAD_TEXTS = {
    leaveOut: "Leave out",
    keepRemovedFlows: "Also keep its removed flows",
    undoTip: "Take back your pick",
    close: "Close",
} as const;

/** A decision on the context pad, in the words of the side it keeps. */
export function padDecisionText(
    decision: MergePadDecision,
    translate: MergeTranslate,
): MergePadDecisionText {
    switch (decision.kind) {
        case "keep":
            return decision.scope === "withContents"
                ? {
                      label: translate(KEEP_INSIDE_TEXTS[decision.side]),
                      tip: translate(KEEP_INSIDE_TIPS[decision.side]),
                  }
                : {
                      label: keepSideText(decision.side, translate),
                      tip: translate(KEEP_TIPS[decision.side]),
                  };
        case "leaveOut":
            return {
                label: translate(MERGE_PAD_TEXTS.leaveOut),
                tip: translate(LEAVE_OUT_TIPS[decision.removedBy]),
            };
        case "keepRemovedFlows":
            return {
                label: translate(MERGE_PAD_TEXTS.keepRemovedFlows),
                tip: restoreOfferText(decision.offer, translate),
            };
        case "undo":
            return {
                label: translate(MERGE_PICK_TEXTS.undo),
                tip: translate(MERGE_PAD_TEXTS.undoTip),
            };
    }
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

const LEFT_OUT_HEADLINES: Record<MergeSide, string> = {
    current: "Left out: {element}, as current removed it",
    incoming: "Left out: {element}, as incoming removed it",
};

const REOPENED_HEADLINE = "Took back the pick. {element} is an open conflict again.";

/**
 * What the user's last pick or undo did, naming the side the pane sent:
 * the kept side, or for a leave-out the side that removed the element. A
 * refused decision keeps the side-less headline.
 */
export function outcomeCardHeadline(
    outcome: MergePaneOutcome,
    acted: MergeActedDecision,
    nameOf: (id: string) => string,
    translate: MergeTranslate,
): string {
    const element = { element: nameOf(outcome.elementId) };
    if (!outcome.applied) return outcomeHeadline(outcome, nameOf, translate);
    switch (outcome.action) {
        case "pick":
            return translate(KEPT_HEADLINES[acted.scope][acted.side], element);
        case "leaveOut":
            return translate(LEFT_OUT_HEADLINES[acted.side], element);
        case "unpick":
            return outcome.reopened.includes(outcome.elementId)
                ? translate(REOPENED_HEADLINE, element)
                : outcomeHeadline(outcome, nameOf, translate);
    }
}

/** The card's count of the reasons it does not list. */
export function moreReasonsText(count: number, translate: MergeTranslate): string {
    return translate("and {count} more", { count: String(count) });
}

/** An unnamed flow, named by the names of its ends. */
export function flowNameText(source: string, target: string, translate: MergeTranslate): string {
    return translate("Flow from {source} to {target}", { source, target });
}
