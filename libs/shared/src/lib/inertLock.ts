type InertTarget = Pick<HTMLElement, "inert">;

/** One hold that blocks user interaction on a target; acquiring it twice is still one hold. */
export interface InertLock {
    acquire(): void;
    release(): void;
}

/**
 * Every lock on one target. The first hold saves the target's own `inert` state
 * and the last release restores it, so locks released in any order neither
 * unlock the target under another hold nor strand it locked.
 */
export interface InertLockGroup {
    createLock(): InertLock;
}

export function createInertLockGroup(target: InertTarget): InertLockGroup {
    const holders = new Set<InertLock>();
    let inertBeforeFirstHold = false;

    const hold = (lock: InertLock): void => {
        if (holders.has(lock)) return;
        if (holders.size === 0) {
            inertBeforeFirstHold = Boolean(target.inert);
        }
        holders.add(lock);
        target.inert = true;
    };

    const drop = (lock: InertLock): void => {
        if (!holders.delete(lock) || holders.size > 0) return;
        target.inert = inertBeforeFirstHold;
    };

    return {
        createLock(): InertLock {
            const lock: InertLock = {
                acquire: () => hold(lock),
                release: () => drop(lock),
            };
            return lock;
        },
    };
}

/**
 * A lock for a target nothing else locks. Locks from separate groups on one
 * target restore each other's saved state out of order, so take every lock on
 * a shared target from one {@link createInertLockGroup}.
 */
export function createInertLock(target: InertTarget): InertLock {
    return createInertLockGroup(target).createLock();
}
