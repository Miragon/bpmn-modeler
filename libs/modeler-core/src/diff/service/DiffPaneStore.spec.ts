import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeDiffPaneHandle } from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";

const fakeHandle = (uri: string) => new FakeDiffPaneHandle(uri);

const LEFT = "git:/repo/diagram.bpmn?ref=HEAD";
const RIGHT = "file:///repo/diagram.bpmn";

describe("DiffPaneStore", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ─── compare-files registration & lookup ────────────────────────────────

    it("keeps two sessions of the same files apart, each with its own panes", () => {
        const store = new DiffPaneStore();
        const first = store.registerCompareFiles(LEFT, RIGHT);
        const firstPane = fakeHandle(RIGHT);
        first.attachPane(firstPane);
        const second = store.registerCompareFiles(LEFT, RIGHT);
        const secondPane = fakeHandle(RIGHT);

        const awaiting = store.awaitingPaneFor(RIGHT);
        second.attachPane(secondPane);

        expect(awaiting).toBe(second);
        expect(store.sessionOf(firstPane)).toBe(first);
        expect(store.sessionOf(secondPane)).toBe(second);
        expect(store.paneCountFor(RIGHT)).toBe(2);
    });

    it("registerCompareFiles indexes both URIs to the same session", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        expect(store.findByUri(LEFT)).toBe(session);
        expect(store.findByUri(RIGHT)).toBe(session);
        expect(session.origin).toBe("compare-files");
    });

    it("findByUri returns undefined for an unknown URI", () => {
        const store = new DiffPaneStore();
        expect(store.findByUri("file:///nothing.bpmn")).toBeUndefined();
    });

    // ─── paneCountFor ───────────────────────────────────────────────────────

    it("paneCountFor counts a pane once it is attached to the session", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        expect(store.paneCountFor(LEFT)).toBe(0); // registered, not attached
        session.attachPane(fakeHandle(LEFT));
        expect(store.paneCountFor(LEFT)).toBe(1);
    });

    it("paneCountFor counts a pending SCM pane", () => {
        const store = new DiffPaneStore();
        store.addPendingScm("/repo/diagram.bpmn", fakeHandle(RIGHT));
        expect(store.paneCountFor(RIGHT)).toBe(1);
    });

    // ─── pending SCM panes ────────────────────────────────────────────────────

    it("pairs a pending SCM pane only with one of another URI", () => {
        const store = new DiffPaneStore();
        const key = "/repo/diagram.bpmn";
        const firstGit = fakeHandle(LEFT);
        const secondGit = fakeHandle(LEFT);
        store.addPendingScm(key, firstGit);

        const twoGitSides = store.takePendingPartner(key, secondGit);
        store.addPendingScm(key, secondGit);
        const partner = store.takePendingPartner(key, fakeHandle(RIGHT));

        expect(twoGitSides).toBeUndefined();
        expect(partner).toBe(firstGit);
        expect(store.paneCountFor(LEFT)).toBe(1);
    });

    it("hands the newest compare session waiting for a pane, not an older one VS Code never opened", () => {
        const store = new DiffPaneStore();
        const shown = store.registerCompareFiles(LEFT, RIGHT);
        shown.attachPane(fakeHandle(LEFT));
        shown.attachPane(fakeHandle(RIGHT));
        store.registerCompareFiles(LEFT, RIGHT);
        const swapped = store.registerCompareFiles(RIGHT, LEFT);

        expect(store.awaitingPaneFor(LEFT)).toBe(swapped);
    });

    it("removePendingByHandle drops the matching entry and reports success", () => {
        const store = new DiffPaneStore();
        const handle = fakeHandle(RIGHT);
        store.addPendingScm("/repo/diagram.bpmn", handle);

        expect(store.removePendingByHandle(handle)).toBe(true);
        expect(store.removePendingByHandle(handle)).toBe(false); // already gone
        expect(store.paneCountFor(RIGHT)).toBe(0);
    });

    // ─── remove ────────────────────────────────────────────────────────────────

    it("remove clears both index entries", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        store.remove(session);
        expect(store.findByUri(LEFT)).toBeUndefined();
        expect(store.findByUri(RIGHT)).toBeUndefined();
    });

    it("a removed session's TTL never sweeps the same pair opened again", () => {
        const store = new DiffPaneStore();
        store.remove(store.registerCompareFiles(LEFT, RIGHT));
        vi.advanceTimersByTime(10_000);

        const reopened = store.registerCompareFiles(LEFT, RIGHT);
        reopened.attachPane(fakeHandle(LEFT));
        store.cancelTtl(reopened);
        vi.advanceTimersByTime(20_000);

        expect(store.findByUri(LEFT)).toBe(reopened);
        expect(store.findByUri(RIGHT)).toBe(reopened);
    });

    // ─── TTL sweeping ────────────────────────────────────────────────────────

    it("sweeps an orphaned compare-files session after the TTL elapses", () => {
        const store = new DiffPaneStore();
        store.registerCompareFiles(LEFT, RIGHT);

        vi.advanceTimersByTime(30_000);

        expect(store.findByUri(LEFT)).toBeUndefined();
        expect(store.findByUri(RIGHT)).toBeUndefined();
    });

    it("cancelTtl keeps a session alive past the TTL once a pane attaches", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        session.attachPane(fakeHandle(LEFT));
        store.cancelTtl(session);
        vi.advanceTimersByTime(30_000);

        expect(store.findByUri(LEFT)).toBe(session);
    });

    it("the TTL sweep leaves a session that gained a pane untouched", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        // A pane attaches but the timer is (deliberately) not cancelled — the
        // emptiness guard must still spare the session when the sweep fires.
        session.attachPane(fakeHandle(LEFT));
        vi.advanceTimersByTime(30_000);

        expect(store.findByUri(LEFT)).toBe(session);
    });

    it("dispose clears armed TTL timers so they never fire", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        store.dispose();
        vi.advanceTimersByTime(30_000);

        // The session is still indexed because the sweep never ran.
        expect(store.findByUri(LEFT)).toBe(session);
    });
});
