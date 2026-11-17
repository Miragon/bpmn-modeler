import { elementTypeName } from "@miragon/bpmn-modeler-element-template-builder";
import type { MergeCaptionRole, MergeMarker, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import type { MergePadDecision } from "./mergePadDecisions";
import {
    keepInsideText,
    keepSideText,
    MERGE_PAD_TEXTS,
    MERGE_PICK_TEXTS,
    mergeSideText,
    type MergeTranslate,
} from "./mergeTexts";

// The words of a merge pane's bar and its "…" menu; each is a translation key.
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

/** The caption's side word and its detail, the branch and commit, which a narrow bar drops first. */
export function mergeCaptionParts(
    caption: MergeSideCaption,
    translate: (key: string) => string,
): { side: string; detail?: string } {
    const role = MERGE_ROLE_TEXTS[caption.role];
    const name = [role === undefined ? undefined : translate(role), caption.ref]
        .filter((part) => part !== undefined)
        .join(" ");
    const detail = [name, caption.shortHash].filter((part) => part).join(" · ");
    const side = mergeSideText(caption.side, translate);
    return detail === "" ? { side } : { side, detail };
}

/** What each marker means on the pane that shows it. */
export const MERGE_MARKER_LABELS: Readonly<Record<MergeMarker, string>> = {
    takenFromThisSide: "Taken from this side",
    takenFromOtherSide: "Taken from the other side",
    conflict: "Conflict",
};

// The tooltips' words, English only until the translations follow; the catalogs fall back to the key.
const MARKER_COUNT_TIPS: Readonly<Record<MergeMarker, string>> = {
    takenFromThisSide: "Elements of this version the result keeps as they are here.",
    takenFromOtherSide:
        "Elements of this version the result takes from the other version, or leaves out as the other version removed them.",
    conflict: "Open conflicts on elements this version has.",
};

const COUNTED_ON_OTHER_PANE =
    "Elements only the other version has are counted on the other pane only.";

/**
 * A count's tooltip: its label and count, what it counts, and why the other
 * pane counts differently, as each pane counts only what its version has.
 */
export function markerCountTip(
    marker: MergeMarker,
    count: number,
    translate: MergeTranslate,
): string {
    return `${translate(MERGE_MARKER_LABELS[marker])}: ${count}. ${translate(MARKER_COUNT_TIPS[marker])} ${translate(COUNTED_ON_OTHER_PANE)}`;
}

/** The step list the menu switches between, which ‹ › walk. */
export const MERGE_STEP_TEXTS = {
    stepList: "Step through",
    openConflictSteps: "Open conflicts",
    allSteps: "All merged elements",
} as const;

/** The "…" menu's own words, English only until the translations follow. */
export const MERGE_MENU_TEXTS = {
    more: "More actions",
    steppedHere: "This step has no shape, so it is listed here.",
    close: "Close",
} as const;

/** The count of the conflicts left to decide. */
export function openConflictsText(count: number, translate: MergeTranslate): string {
    if (count === 0) return translate("No open conflicts");
    if (count === 1) return translate("1 open conflict");
    return translate("{count} open conflicts", { count: String(count) });
}

/** Why Build is disabled, on the bar or in the menu. */
export function buildBlockedText(count: number, translate: MergeTranslate): string {
    return count === 1
        ? translate("1 conflict left")
        : translate("{count} conflicts left", { count: String(count) });
}

export function reviewNotesText(count: number, translate: MergeTranslate): string {
    return translate("Review notes ({count})", { count: String(count) });
}

/** The heading of the menu's list of the elements no canvas draws. */
export function shapelessHeadingText(count: number, translate: MergeTranslate): string {
    return translate("Not visible in the diagram ({count})", { count: String(count) });
}

/** What the "…" button's count says, as part of its name. */
export function openShapelessConflictsText(count: number, translate: MergeTranslate): string {
    return count === 1
        ? translate("1 open conflict not visible in the diagram")
        : translate("{count} open conflicts not visible in the diagram", {
              count: String(count),
          });
}

/** A shape-less element's row in the menu: its name, or its id, and its type in words (`Data store`). */
export function shapelessEntryText(
    entry: { readonly id: string; readonly type: string; readonly name?: string },
    translate: MergeTranslate,
): string {
    return `${entry.name ?? entry.id} (${elementTypeName(entry.type, translate)})`;
}

/** A menu row's button: the pad entry's short words, which name the side where it picks one. */
export function decisionButtonText(decision: MergePadDecision, translate: MergeTranslate): string {
    switch (decision.kind) {
        case "keep":
            return decision.scope === "withContents"
                ? keepInsideText(decision.side, translate)
                : keepSideText(decision.side, translate);
        case "leaveOut":
            return translate(MERGE_PAD_TEXTS.leaveOut);
        case "keepRemovedFlows":
            return translate(MERGE_PAD_TEXTS.keepRemovedFlows);
        case "undo":
            return translate(MERGE_PICK_TEXTS.undo);
    }
}
