import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

// Fixed positions: current left, incoming right, during a rebase too; the captions name the roles.
const MERGE_SIDE_OF_PANE: Record<DiffSide, MergeSide> = {
    before: "current",
    after: "incoming",
};

const PANE_OF_MERGE_SIDE: Record<MergeSide, DiffSide> = {
    current: "before",
    incoming: "after",
};

/** The merge side a diff pane of a merge view shows. */
export function mergeSideOfPane(diffSide: DiffSide): MergeSide {
    return MERGE_SIDE_OF_PANE[diffSide];
}

/** The diff pane that shows a merge side. */
export function diffSideOfMerge(side: MergeSide): DiffSide {
    return PANE_OF_MERGE_SIDE[side];
}
