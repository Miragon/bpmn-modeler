/** Which list a merge pane's Next and Previous walk: the open conflicts, or every element either pane marks. */
export type MergeStepList = "openConflicts" | "all";

/**
 * The element a merge pane's stepper moves to from `cursorId` in `list`,
 * wrapping at either end. The cursor is kept by id, so it can sit on an
 * element that left the list (a conflict the user decided); the step then
 * goes on from that element's place in `all`, the list every step list
 * follows.
 */
export function nextMergeStep(
    list: readonly string[],
    all: readonly string[],
    cursorId: string | undefined,
    direction: 1 | -1,
): string | undefined {
    if (list.length === 0) return undefined;
    const first = direction === 1 ? list[0] : list[list.length - 1];
    const listIndex = cursorId === undefined ? -1 : list.indexOf(cursorId);
    if (listIndex >= 0) {
        return list[(listIndex + direction + list.length) % list.length];
    }
    const place = cursorId === undefined ? -1 : all.indexOf(cursorId);
    if (place < 0) return first;
    const ahead = (id: string) => (all.indexOf(id) - place) * direction > 0;
    const candidates = direction === 1 ? list : [...list].reverse();
    return candidates.find(ahead) ?? first;
}

/** Where the cursor stands in `list`, counted from 0, or none while it is on no step of it. */
export function mergeStepPosition(
    list: readonly string[],
    cursorId: string | undefined,
): { readonly index: number; readonly total: number } | undefined {
    const index = cursorId === undefined ? -1 : list.indexOf(cursorId);
    return index < 0 ? undefined : { index, total: list.length };
}
