import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

// Fixed positions: current left, incoming right, during a rebase too; the captions name the roles.
const MERGE_SIDE_OF_PANE: Record<DiffSide, MergeSide> = {
    before: "current",
    after: "incoming",
};

/** The merge side a diff pane of a merge view shows. */
export function mergeSideOfPane(diffSide: DiffSide): MergeSide {
    return MERGE_SIDE_OF_PANE[diffSide];
}

/** A value of each merge side, left pane's first. */
export function inPaneOrder<T>(bySide: Readonly<Record<MergeSide, T>>): readonly [T, T] {
    return [bySide[mergeSideOfPane("before")], bySide[mergeSideOfPane("after")]];
}

const OTHER_SIDE: Record<MergeSide, MergeSide> = { current: "incoming", incoming: "current" };

/** The side a merge side is merged with. */
export function otherMergeSide(side: MergeSide): MergeSide {
    return OTHER_SIDE[side];
}
