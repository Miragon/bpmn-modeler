import { describe, expect, it } from "vitest";

import { ModelerSession } from "./session";

describe("ModelerSession", () => {
    it("preserves the id from the constructor", () => {
        expect(new ModelerSession("editor-1").id).toBe("editor-1");
    });

    it("is not guarded when fresh", () => {
        expect(new ModelerSession("s").isGuarded("<host/>")).toBe(false);
    });

    it("guards matching content after acquire and unguards after release", () => {
        const session = new ModelerSession("s");

        session.acquireGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(true);
        expect(session.isGuarded("<host-edit/>")).toBe(false);

        session.releaseGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(false);
    });

    // The guard is a counter, not a boolean: overlapping async writes nest,
    // so two acquires must require two releases before the guard lifts.
    it("requires one release per acquire when nested", () => {
        const session = new ModelerSession("s");

        session.acquireGuard("<write/>");
        session.acquireGuard("<write/>");

        session.releaseGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(true);

        session.releaseGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(false);
    });

    // A release on a zero counter must not drive it negative, or a later single
    // acquire would fail to guard (the `> 0` check at session.ts:23).
    it("ignores underflow so a later acquire still guards", () => {
        const session = new ModelerSession("s");

        session.releaseGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(false);

        session.acquireGuard("<write/>");
        expect(session.isGuarded("<write/>")).toBe(true);
    });

    it("matches echoes after line-ending normalization", () => {
        const session = new ModelerSession("s");

        session.acquireGuard("<xml/>\r\n");

        expect(session.isGuarded("<xml/>\n")).toBe(true);
    });
});
