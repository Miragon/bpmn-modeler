import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types/domain";

// The host draws its own titles, so these are the core's English; the panes translate their captions.
export const MERGE_SIDE_WORDS: Readonly<Record<MergeSide, string>> = {
    current: "Current",
    incoming: "Incoming",
};

/** A side as a tab title names it: its branch, its commit or its position. */
export function mergeSideName(caption: MergeSideCaption): string {
    return caption.ref ?? caption.shortHash ?? MERGE_SIDE_WORDS[caption.side];
}

/** How a host titles one side of a merge: its position, then the branch and commit Git names it by. */
export interface MergeSideTitle {
    readonly title: string;
    readonly ref?: string;
    readonly shortHash?: string;
}

/**
 * A side by its position first, so a title and a pane's bar point at the same
 * side. The bar's word follows the modeler's language and this one does not,
 * so the two words are equal in English only; the branch and commit always are.
 */
export function mergeSideTitle({ side, ref, shortHash }: MergeSideCaption): MergeSideTitle {
    return {
        title: MERGE_SIDE_WORDS[side],
        ...(ref === undefined ? {} : { ref }),
        ...(shortHash === undefined ? {} : { shortHash }),
    };
}
