import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `DiffPaneStore` imports the `Disposable` *type* from vscode; it is erased at
// runtime, but the module specifier must still resolve under vitest.
vi.mock("vscode", () => ({}));

import { DiffPaneHandle } from "../domain/DiffSession";
import { DiffPaneStore } from "./DiffPaneStore";

function fakeHandle(uri: string): DiffPaneHandle {
    let ready = false;
    return {
        uri,
        isReady: () => ready,
        setReady: () => {
            ready = true;
        },
        getText: vi.fn(() => ""),
        postMessage: vi.fn().mockResolvedValue(true),
        dispose: vi.fn(),
    };
}

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

    // ─── hasPaneForUri ───────────────────────────────────────────────────────

    it("hasPaneForUri is true once a pane is attached to the session", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        expect(store.hasPaneForUri(LEFT)).toBe(false); // registered, not attached
        session.attachPane(fakeHandle(LEFT));
        expect(store.hasPaneForUri(LEFT)).toBe(true);
    });

    it("hasPaneForUri is true for a pending SCM pane", () => {
        const store = new DiffPaneStore();
        store.addPendingScm("/repo/diagram.bpmn", fakeHandle(RIGHT));
        expect(store.hasPaneForUri(RIGHT)).toBe(true);
    });

    // ─── pending SCM panes ────────────────────────────────────────────────────

    it("add/get/delete pending SCM panes by key", () => {
        const store = new DiffPaneStore();
        const handle = fakeHandle(RIGHT);
        const key = "/repo/diagram.bpmn";

        store.addPendingScm(key, handle);
        expect(store.getPendingScm(key)).toBe(handle);

        store.deletePendingScm(key);
        expect(store.getPendingScm(key)).toBeUndefined();
    });

    it("removePendingByHandle drops the matching entry and reports success", () => {
        const store = new DiffPaneStore();
        const handle = fakeHandle(RIGHT);
        store.addPendingScm("/repo/diagram.bpmn", handle);

        expect(store.removePendingByHandle(handle)).toBe(true);
        expect(store.removePendingByHandle(handle)).toBe(false); // already gone
        expect(store.hasPaneForUri(RIGHT)).toBe(false);
    });

    // ─── remove ────────────────────────────────────────────────────────────────

    it("remove clears both index entries", () => {
        const store = new DiffPaneStore();
        const session = store.registerCompareFiles(LEFT, RIGHT);

        store.remove(session);
        expect(store.findByUri(LEFT)).toBeUndefined();
        expect(store.findByUri(RIGHT)).toBeUndefined();
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
