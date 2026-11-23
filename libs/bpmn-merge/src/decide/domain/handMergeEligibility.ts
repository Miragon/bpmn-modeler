import type { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "../../kernel/domain/mergeResult";

/** The texts of one element that base, current and incoming hold, pairwise different, which a hand merge starts from. */
export interface HandMergeTexts {
    readonly base: string;
    readonly current: string;
    readonly incoming: string;
}

/** What the eligibility of a hand merge reads of the decisions. */
type DecidedElements = Pick<MergeDecisions, "originOf" | "sideOf">;

/**
 * How a hand merge of an element whose three texts differ starts: on the
 * version the user's pick keeps, or with a pick, where none decides it yet.
 */
export type HandMergeStart = "pickedVersion" | "withPick";

export function handMergeStartOf(
    decisions: DecidedElements,
    handMergeTexts: ReadonlyMap<string, HandMergeTexts>,
    id: string,
): HandMergeStart | undefined {
    if (!handMergeTexts.has(id)) return undefined;
    return decisions.originOf(id) === "picked" ? "pickedVersion" : "withPick";
}

/** The side of the user's pick of an element whose three texts differ, which a hand merge may replace; none otherwise. */
export function handMergeableSide(
    decisions: DecidedElements,
    handMergeTexts: ReadonlyMap<string, HandMergeTexts>,
    id: string,
): MergeSide | undefined {
    return handMergeStartOf(decisions, handMergeTexts, id) === "pickedVersion"
        ? decisions.sideOf(id)
        : undefined;
}
