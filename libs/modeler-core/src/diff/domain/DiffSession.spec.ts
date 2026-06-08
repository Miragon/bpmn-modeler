import { describe, expect, it, vi } from "vitest";

import { DiffPaneHandle, DiffSession, basenameOfUriString } from "./DiffSession";

// ─── Fakes ──────────────────────────────────────────────────────────────────

/**
 * Minimal {@link DiffPaneHandle} stand-in — the session only reads `uri` and
 * `isReady()`, so the rest are inert spies.
 */
function fakeHandle(uri: string, ready = false): DiffPaneHandle {
    let readyFlag = ready;
    return {
        uri,
        isReady: () => readyFlag,
        setReady: () => {
            readyFlag = true;
        },
        getText: vi.fn(() => ""),
        postMessage: vi.fn().mockResolvedValue(true),
        dispose: vi.fn(),
    };
}

const BEFORE = "git:/repo/diagram.bpmn?ref=HEAD";
const AFTER = "file:///repo/diagram.bpmn";

// ─── basenameOfUriString ──────────────────────────────────────────────────────

describe("basenameOfUriString", () => {
    it("returns the bare filename for a plain file URI", () => {
        expect(basenameOfUriString("file:///repo/sub/diagram.bpmn")).toBe("diagram.bpmn");
    });

    it("trims a query string so ref-annotated URIs still resolve", () => {
        expect(basenameOfUriString("file:///repo/diagram.bpmn?ref=HEAD")).toBe("diagram.bpmn");
    });

    it("trims a fragment", () => {
        expect(basenameOfUriString("file:///repo/diagram.bpmn#section")).toBe("diagram.bpmn");
    });

    it("URL-decodes percent-encoded characters", () => {
        expect(basenameOfUriString("file:///repo/my%20diagram.bpmn")).toBe("my diagram.bpmn");
    });
});

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
