import type { MergePaneBadge } from "@miragon/bpmn-modeler-shared";
import { MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types";

/** How a merge pane's canvas draws an element: by one of the three markers, or as a version merged by hand. */
export type MergeMarkLook = MergeMarker | "mergedByHand";

export const MERGE_MARK_LOOKS: readonly MergeMarkLook[] = [...MERGE_MARKERS, "mergedByHand"];

/**
 * The look of every marked element of a pane. A version merged by hand holds
 * lines of both sides, so it takes one look of its own on both panes in place
 * of "taken from this side" and "taken from the other side", which would name
 * the side its pick kept. An open conflict stays a conflict.
 */
export function mergeMarkLooks(
    marks: Readonly<Record<MergeMarker, readonly string[]>>,
    badges: readonly MergePaneBadge[],
): Readonly<Record<MergeMarkLook, readonly string[]>> {
    const openConflicts = new Set(marks.conflict);
    const mergedByHand = badges
        .filter(({ id, pick }) => pick.mergedByHand === true && !openConflicts.has(id))
        .map(({ id }) => id);
    const byHand = new Set(mergedByHand);
    const takenAsItIs = (ids: readonly string[]) => ids.filter((id) => !byHand.has(id));
    return {
        takenFromThisSide: takenAsItIs(marks.takenFromThisSide),
        takenFromOtherSide: takenAsItIs(marks.takenFromOtherSide),
        conflict: marks.conflict,
        mergedByHand,
    };
}
