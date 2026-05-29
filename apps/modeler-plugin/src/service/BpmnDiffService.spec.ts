import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is vscode-free, but `DiffPaneStore` (constructed here as the real
// backing registry) imports the `Disposable` *type* from vscode — erased at
// runtime, yet the specifier must resolve under vitest.
vi.mock("vscode", () => ({}));

import { DiffPaneHandle } from "../domain/DiffSession";
import { DiffPaneStore } from "../infrastructure/DiffPaneStore";
import { BpmnDiffService } from "./BpmnDiffService";

// ─── Sample BPMN ──────────────────────────────────────────────────────────────

const beforeBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

// Adds a task → the differ reports `Task_1` as `_added`.
const afterBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

const LEFT = "git:/repo/diagram.bpmn?ref=HEAD";
const RIGHT = "file:///repo/diagram.bpmn";

// ─── Fakes ──────────────────────────────────────────────────────────────────

function fakeHandle(
    uri: string,
    text = "",
): DiffPaneHandle & { postMessage: ReturnType<typeof vi.fn> } {
    let ready = false;
    return {
        uri,
        isReady: () => ready,
        setReady: () => {
            ready = true;
        },
        getText: () => text,
        postMessage: vi.fn().mockResolvedValue(true),
        dispose: vi.fn(),
    };
}

function createService() {
    const notifier = {
        logInfo: vi.fn(),
        logError: vi.fn(),
        showError: vi.fn(),
    };
    const vsSettings = { getLanguage: vi.fn().mockReturnValue("en") };
    const store = new DiffPaneStore();
    const service = new BpmnDiffService(notifier as never, vsSettings as never, store);
    return { service, notifier, vsSettings, store };
}

/** Registers a compare-files session with both panes attached. */
function attachedPair(store: DiffPaneStore, beforeText = "", afterText = "") {
    const session = store.registerCompareFiles(LEFT, RIGHT);
    const before = fakeHandle(LEFT, beforeText);
    const after = fakeHandle(RIGHT, afterText);
    session.attachPane(before);
    session.attachPane(after);
    return { session, before, after };
}

const messageTypes = (handle: { postMessage: ReturnType<typeof vi.fn> }): string[] =>
    handle.postMessage.mock.calls.map(([msg]) => (msg as { type: string }).type);

describe("BpmnDiffService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── Viewer file ──────────────────────────────────────────────────────────

    it("sendViewerFile replies with a viewer-mode BpmnFileQuery", async () => {
        const { service } = createService();
        const handle = fakeHandle(RIGHT, beforeBpmn);

        await service.sendViewerFile(handle);

        expect(handle.postMessage).toHaveBeenCalledTimes(1);
        const msg = handle.postMessage.mock.calls[0][0] as { type: string; viewerMode: string };
        expect(msg.type).toBe("BpmnFileQuery");
        expect(msg.viewerMode).toBe("viewer");
    });

    // ─── Viewport / cursor forwarding ──────────────────────────────────────────

    it("forwardViewport posts a SyncViewportQuery to the partner pane", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardViewport(before, { x: 1, y: 2, width: 3, height: 4 });

        expect(messageTypes(after)).toEqual(["SyncViewportQuery"]);
        expect(before.postMessage).not.toHaveBeenCalled();
    });

    it("forwardCursor posts a SyncCursorQuery to the partner pane", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardCursor(after, 5);

        expect(messageTypes(before)).toEqual(["SyncCursorQuery"]);
    });

    it("forwarding is a no-op when the session has no partner attached", async () => {
        const { service, store } = createService();
        const session = store.registerCompareFiles(LEFT, RIGHT);
        const before = fakeHandle(LEFT);
        session.attachPane(before); // after side never attached

        await service.forwardViewport(before, { x: 0, y: 0, width: 0, height: 0 });

        expect(before.postMessage).not.toHaveBeenCalled();
    });

    // ─── markReady arming ──────────────────────────────────────────────────────

    it("markReady sends language but no highlights while only one side is ready", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store, beforeBpmn, afterBpmn);

        await service.markReady(before);

        expect(messageTypes(before)).toEqual(["LanguageQuery"]);
        expect(messageTypes(after)).toEqual([]);
    });

    it("markReady runs the differ and broadcasts highlights once both sides are ready", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store, beforeBpmn, afterBpmn);

        await service.markReady(before);
        await service.markReady(after);

        expect(messageTypes(before)).toContain("ApplyDiffHighlightsQuery");
        expect(messageTypes(after)).toContain("ApplyDiffHighlightsQuery");

        // The added task lands on the after side only.
        const afterHighlights = after.postMessage.mock.calls
            .map(([m]) => m as { type: string; added?: string[] })
            .find((m) => m.type === "ApplyDiffHighlightsQuery");
        expect(afterHighlights?.added).toContain("Task_1");
    });

    // ─── Language re-broadcast ──────────────────────────────────────────────────

    it("rebroadcastLanguage posts a LanguageQuery only to ready panes", () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);
        before.setReady(); // after stays not-ready

        service.rebroadcastLanguage();

        expect(messageTypes(before)).toEqual(["LanguageQuery"]);
        expect(after.postMessage).not.toHaveBeenCalled();
    });
});
