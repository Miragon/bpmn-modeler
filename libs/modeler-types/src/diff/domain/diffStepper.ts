/**
 * Whether a diff pane's Next and Previous have a change to step to. Counts are
 * not enough: a pane can count changes it has no element to step to.
 */
export function canStep(steps: readonly string[]): boolean {
    return steps.length > 0;
}

/**
 * Where a diff pane's Next or Previous lands among `length` changes, wrapping
 * round. From the start (`-1`) a plain modulo would land Previous on the
 * second to last change; it lands on the last instead.
 */
export function stepCursor(cursor: number, direction: 1 | -1, length: number): number {
    if (cursor === -1) {
        return direction === 1 ? 0 : length - 1;
    }
    return (cursor + direction + length) % length;
}

/**
 * The change next to the one at `cursor` that this pane shows, searching
 * outward and trying the step's direction first: where a pane anchors when
 * the current change exists only in the partner pane's version.
 */
export function nearestPresent(
    order: readonly string[],
    cursor: number,
    direction: 1 | -1,
    isPresent: (id: string) => boolean,
): string | undefined {
    const length = order.length;
    for (let distance = 1; distance < length; distance++) {
        for (const step of [direction, -direction]) {
            const id = order[(((cursor + step * distance) % length) + length) % length];
            if (isPresent(id)) {
                return id;
            }
        }
    }
    return undefined;
}
