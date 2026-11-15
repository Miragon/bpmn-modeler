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
