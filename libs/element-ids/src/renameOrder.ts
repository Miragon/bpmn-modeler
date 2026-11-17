export interface Rename<T> {
    /** What is renamed; it stays the same object across a detour through a temporary ID. */
    readonly item: T;
    readonly from: string;
    readonly to: string;
}

/**
 * Orders the renames so that no step claims an ID another step has not given up
 * yet, since bpmn-js refuses a second element with the same ID. A cycle, such as
 * two elements swapping IDs, goes through one temporary ID.
 */
export function orderRenames<T>(
    renames: readonly Rename<T>[],
    isTakenElsewhere: (id: string) => boolean,
): Rename<T>[] {
    const pending = renames.filter((rename) => rename.from !== rename.to);
    const held = new Set(pending.map((rename) => rename.from));
    const targets = new Set(pending.map((rename) => rename.to));
    const steps: Rename<T>[] = [];

    const take = (rename: Rename<T>) => {
        steps.push(rename);
        held.delete(rename.from);
        held.add(rename.to);
    };

    while (pending.length > 0) {
        const ready = pending.findIndex((rename) => !held.has(rename.to));
        if (ready >= 0) {
            take(pending.splice(ready, 1)[0]!);
            continue;
        }
        const [blocked] = pending.splice(0, 1);
        const temporary = temporaryId(
            blocked!.from,
            (id) => held.has(id) || targets.has(id) || isTakenElsewhere(id),
        );
        take({ item: blocked!.item, from: blocked!.from, to: temporary });
        pending.push({ item: blocked!.item, from: temporary, to: blocked!.to });
    }
    return steps;
}

function temporaryId(from: string, isTaken: (id: string) => boolean): string {
    let candidate = `${from}_tmp`;
    for (let counter = 2; isTaken(candidate); counter++) {
        candidate = `${from}_tmp${counter}`;
    }
    return candidate;
}

/**
 * The renames that can happen: one whose target something outside the renames
 * holds is dropped, and so, in turn, is one that waited for a dropped rename to
 * give its ID up.
 */
export function dropBlockedRenames<T>(
    renames: readonly Rename<T>[],
    isHeld: (id: string) => boolean,
): Rename<T>[] {
    let current = [...renames];
    for (;;) {
        const freed = new Set(current.map((rename) => rename.from));
        const next = current.filter((rename) => !isHeld(rename.to) || freed.has(rename.to));
        if (next.length === current.length) {
            return current;
        }
        current = next;
    }
}
