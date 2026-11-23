import type { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "../../kernel/domain/mergeResult";

/** The texts of one element that base, current and incoming hold, pairwise different, which a hand merge starts from. */
export interface HandMergeTexts {
    readonly base: string;
    readonly current: string;
    readonly incoming: string;
}

/** The side of the user's pick of an element whose three texts differ, which a hand merge may replace; none otherwise. */
export function handMergeableSide(
    decisions: MergeDecisions,
    handMergeTexts: ReadonlyMap<string, HandMergeTexts>,
    id: string,
): MergeSide | undefined {
    if (!handMergeTexts.has(id) || decisions.originOf(id) !== "picked") return undefined;
    return decisions.sideOf(id);
}
