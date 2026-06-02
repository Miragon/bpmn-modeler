import { describe, expect, it } from "vitest";

import { ModelerSession } from "./session";

describe("ModelerSession", () => {
    it("preserves the id from the constructor", () => {
        expect(new ModelerSession("editor-1").id).toBe("editor-1");
    });

    it("is not guarded when fresh", () => {
        expect(new ModelerSession("s").isGuarded()).toBe(false);
    });

    it("guards after a single acquire and unguards after release", () => {
        const session = new ModelerSession("s");

        session.acquireGuard();
        expect(session.isGuarded()).toBe(true);

        session.releaseGuard();
        expect(session.isGuarded()).toBe(false);
    });

    // The guard is a counter, not a boolean: overlapping async writes nest,
    // so two acquires must require two releases before the guard lifts.
    it("requires one release per acquire when nested", () => {
        const session = new ModelerSession("s");

        session.acquireGuard();
        session.acquireGuard();

        session.releaseGuard();
        expect(session.isGuarded()).toBe(true);

        session.releaseGuard();
        expect(session.isGuarded()).toBe(false);
    });

    // A release on a zero counter must not drive it negative, or a later single
    // acquire would fail to guard (the `> 0` check at session.ts:23).
    it("ignores underflow so a later acquire still guards", () => {
        const session = new ModelerSession("s");

        session.releaseGuard();
        expect(session.isGuarded()).toBe(false);

        session.acquireGuard();
        expect(session.isGuarded()).toBe(true);
    });
});
