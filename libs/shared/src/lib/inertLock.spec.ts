import { describe, expect, it } from "vitest";

import { createInertLock, createInertLockGroup, type InertLock } from "./inertLock";

describe("createInertLock", () => {
    it("locks an interactive target and unlocks it on release", () => {
        const target = { inert: false };
        const lock = createInertLock(target);

        lock.acquire();
        expect(target.inert).toBe(true);

        lock.release();
        expect(target.inert).toBe(false);
    });

    it("keeps a target that was already inert locked after the release", () => {
        const target = { inert: true };
        const lock = createInertLock(target);

        lock.acquire();
        lock.release();

        expect(target.inert).toBe(true);
    });

    it("restores the state from before the first acquire when acquired twice", () => {
        const target = { inert: false };
        const lock = createInertLock(target);

        lock.acquire();
        lock.acquire();
        lock.release();

        expect(target.inert).toBe(false);
    });

    it("leaves the target alone when released without being acquired", () => {
        const lockedTarget = { inert: true };
        const freeTarget = { inert: false };

        createInertLock(lockedTarget).release();
        createInertLock(freeTarget).release();

        expect(lockedTarget.inert).toBe(true);
        expect(freeTarget.inert).toBe(false);
    });

    it("saves the target's state afresh when acquired again after a release", () => {
        const target = { inert: false };
        const lock = createInertLock(target);
        lock.acquire();
        lock.release();
        target.inert = true;

        lock.acquire();
        lock.release();

        expect(target.inert).toBe(true);
    });
});

describe("createInertLockGroup", () => {
    function twoLocks(target: { inert: boolean }): [InertLock, InertLock] {
        const group = createInertLockGroup(target);
        return [group.createLock(), group.createLock()];
    }

    it.each([
        ["the first", 0],
        ["the second", 1],
    ])("keeps the target locked when %s of two holds releases", (_, releasedFirst) => {
        const target = { inert: false };
        const locks = twoLocks(target);
        locks[0].acquire();
        locks[1].acquire();

        locks[releasedFirst].release();
        expect(target.inert).toBe(true);

        locks[1 - releasedFirst].release();
        expect(target.inert).toBe(false);
    });

    it("restores the state from before the first hold, not the state a later hold found", () => {
        const target = { inert: false };
        const [flushLock, switchLock] = twoLocks(target);

        switchLock.acquire();
        flushLock.acquire();
        switchLock.release();
        flushLock.release();

        expect(target.inert).toBe(false);
    });

    it("keeps a target that was already inert locked through interleaved holds", () => {
        const target = { inert: true };
        const [first, second] = twoLocks(target);

        first.acquire();
        second.acquire();
        first.release();
        second.release();

        expect(target.inert).toBe(true);
    });

    it("counts a lock acquired twice as a single hold", () => {
        const target = { inert: false };
        const [first, second] = twoLocks(target);

        first.acquire();
        first.acquire();
        second.acquire();
        first.release();
        expect(target.inert).toBe(true);

        second.release();
        expect(target.inert).toBe(false);
    });

    it("ignores a release from a lock that holds nothing while another lock holds", () => {
        const target = { inert: false };
        const [holding, idle] = twoLocks(target);
        holding.acquire();

        idle.release();

        expect(target.inert).toBe(true);
    });

    it("stays locked for a hold that is never released", () => {
        const target = { inert: false };
        const group = createInertLockGroup(target);
        const flushLock = group.createLock();
        const switchLock = group.createLock();
        const reloadLock = group.createLock();
        flushLock.acquire();
        switchLock.acquire();

        reloadLock.acquire();
        flushLock.release();
        switchLock.release();

        expect(target.inert).toBe(true);
    });

    it("saves the target's state afresh for the first hold after every lock released", () => {
        const target = { inert: false };
        const [first, second] = twoLocks(target);
        first.acquire();
        second.acquire();
        second.release();
        first.release();
        target.inert = true;

        second.acquire();
        second.release();

        expect(target.inert).toBe(true);
    });

    describe.each([false, true])("with the target's own inert state %s", (inertBeforeLocks) => {
        type LockEvent = { lock: number; acquire: boolean };

        function ordersAcquiringBeforeReleasing(remaining: LockEvent[]): LockEvent[][] {
            if (remaining.length === 0) return [[]];
            return remaining
                .filter(
                    (event) =>
                        event.acquire ||
                        !remaining.some((other) => other.lock === event.lock && other.acquire),
                )
                .flatMap((next) =>
                    ordersAcquiringBeforeReleasing(remaining.filter((event) => event !== next)).map(
                        (rest) => [next, ...rest],
                    ),
                );
        }

        const lockIds = [0, 1, 2];
        const orders = ordersAcquiringBeforeReleasing(
            lockIds.flatMap((lock) => [
                { lock, acquire: true },
                { lock, acquire: false },
            ]),
        );

        it("covers every interleaving of three holds", () => {
            expect(orders).toHaveLength(90);
        });

        it("is locked exactly while a hold is open and restored after the last release", () => {
            for (const order of orders) {
                const target = { inert: inertBeforeLocks };
                const group = createInertLockGroup(target);
                const locks = lockIds.map(() => group.createLock());
                const held = new Set<number>();
                const orderLabel = order
                    .map(({ lock, acquire }) => `${acquire ? "acquire" : "release"} ${lock}`)
                    .join(", ");

                for (const { lock, acquire } of order) {
                    if (acquire) {
                        locks[lock].acquire();
                        held.add(lock);
                    } else {
                        locks[lock].release();
                        held.delete(lock);
                    }
                    expect(target.inert, orderLabel).toBe(held.size > 0 || inertBeforeLocks);
                }
            }
        });
    });
});
