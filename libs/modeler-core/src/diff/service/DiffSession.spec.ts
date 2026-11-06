import { describe, expect, it } from "vitest";

import { FakeDiffPaneHandle } from "../../testing";
import { DiffSession } from "./DiffSession";

// ─── Fakes ──────────────────────────────────────────────────────────────────

function fakeHandle(uri: string, ready = false): FakeDiffPaneHandle {
    const handle = new FakeDiffPaneHandle(uri);
    if (ready) handle.setReady();
    return handle;
}

const BEFORE = "git:/repo/diagram.bpmn?ref=HEAD";
const AFTER = "file:///repo/diagram.bpmn";

// ─── Factories & side assignment ──────────────────────────────────────────────

describe("DiffSession", () => {
    it("forCompareFiles fixes left=before, right=after", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        expect(session.origin).toBe("compare-files");
        expect(session.beforeUri).toBe(BEFORE);
        expect(session.afterUri).toBe(AFTER);
    });

    it("forScm takes the URIs from the pre-sorted before/after handles", () => {
        const session = DiffSession.forScm(fakeHandle(BEFORE), fakeHandle(AFTER));
        expect(session.origin).toBe("scm");
        expect(session.beforeUri).toBe(BEFORE);
        expect(session.afterUri).toBe(AFTER);
    });

    it("sideFor maps each URI to its slot and unknown URIs to undefined", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        expect(session.sideFor(BEFORE)).toBe("before");
        expect(session.sideFor(AFTER)).toBe("after");
        expect(session.sideFor("file:///other.bpmn")).toBeUndefined();
    });

    // ─── Attach / detach / partner ─────────────────────────────────────────

    it("attachPane fills the slot matching the handle URI", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const before = fakeHandle(BEFORE);

        expect(session.attachPane(before)).toBe("before");
        expect(session.before()).toBe(before);
        expect(session.hasPaneFor(BEFORE)).toBe(true);
        expect(session.hasPaneFor(AFTER)).toBe(false);
    });

    it("attachPane returns undefined for a foreign URI and leaves slots empty", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        expect(session.attachPane(fakeHandle("file:///foreign.bpmn"))).toBeUndefined();
        expect(session.isEmpty()).toBe(true);
    });

    it("partnerOf returns the opposite attached pane", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const before = fakeHandle(BEFORE);
        const after = fakeHandle(AFTER);
        session.attachPane(before);
        session.attachPane(after);

        expect(session.partnerOf(before)).toBe(after);
        expect(session.partnerOf(after)).toBe(before);
    });

    it("partnerOf is undefined while the session is half-attached", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const before = fakeHandle(BEFORE);
        session.attachPane(before);
        expect(session.partnerOf(before)).toBeUndefined();
    });

    it("detachPane empties the slot and is a no-op for unknown handles", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const before = fakeHandle(BEFORE);
        session.attachPane(before);

        session.detachPane(fakeHandle("file:///unknown.bpmn"));
        expect(session.before()).toBe(before);

        session.detachPane(before);
        expect(session.before()).toBeUndefined();
        expect(session.isEmpty()).toBe(true);
    });

    it("attachedPanes lists only the attached slots", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        expect(session.attachedPanes()).toEqual([]);

        const before = fakeHandle(BEFORE);
        session.attachPane(before);
        expect(session.attachedPanes()).toEqual([before]);

        const after = fakeHandle(AFTER);
        session.attachPane(after);
        expect(session.attachedPanes()).toEqual([before, after]);
    });

    // ─── Armed state ────────────────────────────────────────────────────────

    it("isArmed only when both panes are attached AND ready", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const before = fakeHandle(BEFORE, false);
        const after = fakeHandle(AFTER, false);
        session.attachPane(before);
        session.attachPane(after);

        expect(session.isArmed()).toBe(false); // neither ready
        before.setReady();
        expect(session.isArmed()).toBe(false); // only one ready
        after.setReady();
        expect(session.isArmed()).toBe(true); // both ready
    });
});

describe("DiffSession pane slots", () => {
    it.each<{ side: "before" | "after"; uri: string; otherUri: string }>([
        { side: "before", uri: BEFORE, otherUri: AFTER },
        { side: "after", uri: AFTER, otherUri: BEFORE },
    ])("a lone $side pane fills only its own slot until it detaches", ({ uri, otherUri }) => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const pane = fakeHandle(uri);
        session.attachPane(pane);

        expect([session.hasPaneFor(uri), session.hasPaneFor(otherUri)]).toEqual([true, false]);
        expect(session.isEmpty()).toBe(false);
        expect(session.partnerOf(pane)).toBeUndefined();

        session.detachPane(pane);

        expect(session.hasPaneFor(uri)).toBe(false);
        expect(session.isEmpty()).toBe(true);
    });

    it.each<{ side: "before" | "after"; uri: string; otherUri: string }>([
        { side: "before", uri: BEFORE, otherUri: AFTER },
        { side: "after", uri: AFTER, otherUri: BEFORE },
    ])("detaching the $side pane keeps its partner attached", ({ uri, otherUri }) => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        const pane = fakeHandle(uri);
        const partner = fakeHandle(otherUri);
        session.attachPane(pane);
        session.attachPane(partner);

        session.detachPane(pane);

        expect(session.attachedPanes()).toEqual([partner]);
        expect(session.isEmpty()).toBe(false);
    });

    it("answers no pane and no partner for a URI outside the session", () => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        session.attachPane(fakeHandle(BEFORE));
        session.attachPane(fakeHandle(AFTER));

        expect(session.hasPaneFor("file:///foreign.bpmn")).toBe(false);
        expect(session.partnerOf(fakeHandle("file:///foreign.bpmn"))).toBeUndefined();
    });

    it.each<{ panes: string; before?: boolean; after?: boolean; armed: boolean }>([
        { panes: "no pane", armed: false },
        { panes: "a ready before pane alone", before: true, armed: false },
        { panes: "a ready after pane alone", after: true, armed: false },
        {
            panes: "a ready before pane and a loading after pane",
            before: true,
            after: false,
            armed: false,
        },
        {
            panes: "a loading before pane and a ready after pane",
            before: false,
            after: true,
            armed: false,
        },
        { panes: "two ready panes", before: true, after: true, armed: true },
    ])("is armed with $panes: $armed", ({ before, after, armed }) => {
        const session = DiffSession.forCompareFiles(BEFORE, AFTER);
        if (before !== undefined) session.attachPane(fakeHandle(BEFORE, before));
        if (after !== undefined) session.attachPane(fakeHandle(AFTER, after));

        expect(session.isArmed()).toBe(armed);
    });
});
