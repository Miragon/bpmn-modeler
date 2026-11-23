import type { MergePaneSideLack, MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";
import { elementTypeName, MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types/domain";

import { mergeXmlDecisionText } from "./mergeHandMergeTexts";
import type { MergeKeepInside, MergePadDecision } from "./mergePadDecisions";
import { keepSideText, MERGE_PAD_TEXTS, MERGE_PICK_TEXTS, mergeSideText } from "./mergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

// The words of the "…" menu's rows of shape-less elements; each is a translation key.

/** The heading of the menu's list of the elements no canvas draws. */
export function shapelessHeadingText(count: number, translate: MergeTranslate): string {
    return translate("Not visible in the diagram ({count})", { count: String(count) });
}

/** A shape-less element's row in the menu: its name, or its id, and its type in words (`Data store`). */
export function shapelessEntryText(
    entry: { readonly id: string; readonly type: string; readonly name?: string },
    translate: MergeTranslate,
): string {
    return `${entry.name ?? entry.id} (${elementTypeName(entry.type, translate)})`;
}

/**
 * A menu row's worded button: the pad entry's short words, which name the
 * side where it picks one. A keep with everything inside is the pad's icon,
 * named by `padDecisionText`.
 */
export function decisionButtonText(
    decision: Exclude<MergePadDecision, MergeKeepInside>,
    translate: MergeTranslate,
): string {
    switch (decision.kind) {
        case "keep":
            return keepSideText(decision.side, translate);
        case "leaveOut":
            return translate(MERGE_PAD_TEXTS.leaveOut);
        case "keepRemovedWith":
            return translate(MERGE_PAD_TEXTS.keepRemovedWith);
        case "undo":
            return translate(MERGE_PICK_TEXTS.undo);
        case "mergeXml":
            return mergeXmlDecisionText(decision, translate).label;
    }
}

/** What a shape-less row shows of its sides. */
export type MergeShapelessValues = Pick<
    MergePaneShapelessRow,
    "lackingSide" | "differences" | "moreDiffers"
>;

/** A piece of a row's value line; a value of a side is set apart from the words. */
export interface MergeValueSegment {
    readonly text: string;
    readonly value?: true;
}

/** The words of a shape-less row's value lines. */
const MERGE_VALUE_TEXTS = {
    none: "none",
    moreDiffers: "and other content",
} as const;

const LACKING_TEXTS: Record<MergeSide, Record<MergePaneSideLack, string>> = {
    current: { removed: "Removed in current", missing: "Not in current" },
    incoming: { removed: "Removed in incoming", missing: "Not in incoming" },
};

/**
 * The lines below a shape-less row's title: the side that lacks the element,
 * removed from the base or never there, as the library decides; each attribute whose values differ
 * with both sides' values (`errorCode: Current E1 · Incoming E2`), "none"
 * for a side without it; and whether other content differs too. The base's
 * value is never shown. A pick changes none of it.
 */
export function shapelessValueLines(
    values: MergeShapelessValues,
    translate: MergeTranslate,
): readonly (readonly MergeValueSegment[])[] {
    const { lackingSide } = values;
    const lacking =
        lackingSide === undefined
            ? []
            : [[{ text: translate(LACKING_TEXTS[lackingSide.side][lackingSide.lack]) }]];
    const differences = values.differences.map((difference) =>
        MERGE_SIDES.flatMap((side, index): MergeValueSegment[] => {
            const value = difference[side];
            const lead = index === 0 ? `${difference.attribute}: ` : " · ";
            return [
                { text: `${lead}${mergeSideText(side, translate)} ` },
                value === undefined
                    ? { text: translate(MERGE_VALUE_TEXTS.none) }
                    : { text: value, value: true },
            ];
        }),
    );
    const more = values.moreDiffers ? [[{ text: translate(MERGE_VALUE_TEXTS.moreDiffers) }]] : [];
    return [...lacking, ...differences, ...more];
}
