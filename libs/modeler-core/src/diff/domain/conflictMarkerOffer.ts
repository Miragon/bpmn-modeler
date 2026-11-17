/**
 * Whether an editor offers the merge view: on the first sight of conflict
 * markers and when they come back, never while they stay.
 *
 * @param previous whether the editor's document held markers when last read; `undefined` before the first read.
 */
export function shouldOfferMergeView(previous: boolean | undefined, now: boolean): boolean {
    return now && previous !== true;
}
