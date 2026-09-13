/**
 * From the uninitialised cursor (-1) a plain modulo lands backward steps on
 * `length - 2`, skipping the last change; the first step must instead anchor at
 * an end of the cycle so Previous starts on the last change.
 */
export function stepCursor(cursor: number, direction: 1 | -1, length: number): number {
    if (cursor === -1) {
        return direction === 1 ? 0 : length - 1;
    }
    return (cursor + direction + length) % length;
}
