import { describe, expect, it } from "vitest";

import { createTestHost, FakeDiffPaneHandle } from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { BpmnDiffService, ElementXmlChanges } from "./BpmnDiffService";

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

const fakeHandle = (uri: string, text = "") => new FakeDiffPaneHandle(uri, text);

function createService(elementXml?: ElementXmlChanges) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const service = new BpmnDiffService(notifier, settings, store, elementXml);
    return { service, notifier, store };
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

const messageTypes = (handle: FakeDiffPaneHandle): string[] =>
    handle.posted.map((msg) => (msg as { type: string }).type);

describe("BpmnDiffService", () => {
    // ─── Viewer file ──────────────────────────────────────────────────────────

    it("sendViewerFile replies with a viewer-mode BpmnFileQuery", async () => {
        const { service } = createService();
        const handle = fakeHandle(RIGHT, beforeBpmn);

        await service.sendViewerFile(handle);

        expect(handle.posted).toEqual([
            expect.objectContaining({ type: "BpmnFileQuery", viewerMode: "viewer" }),
        ]);
    });

    // ─── Viewport / cursor forwarding ──────────────────────────────────────────

    it("forwardViewport posts a SyncViewportQuery to the partner pane", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardViewport(before, { x: 1, y: 2, width: 3, height: 4 });

        expect(messageTypes(after)).toEqual(["SyncViewportQuery"]);
        expect(before.posted).toEqual([]);
    });

    it("forwardCursor posts a SyncCursorQuery to the partner pane", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardCursor(after, 5);

        expect(messageTypes(before)).toEqual(["SyncCursorQuery"]);
    });

    it("forwardSelection selects the element in the partner pane", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);

        await service.forwardSelection(before, "Task_1");

        expect(after.posted).toEqual([
            expect.objectContaining({ type: "SyncDiffSelectionQuery", elementId: "Task_1" }),
        ]);
        expect(before.posted).toEqual([]);
    });

    it("forwarding is a no-op when the session has no partner attached", async () => {
        const { service, store } = createService();
        const session = store.registerCompareFiles(LEFT, RIGHT);
        const before = fakeHandle(LEFT);
        session.attachPane(before); // after side never attached

        await service.forwardViewport(before, { x: 0, y: 0, width: 0, height: 0 });

        expect(before.posted).toEqual([]);
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
        const afterHighlights = after.posted
            .map((m) => m as { type: string; added?: string[] })
            .find((m) => m.type === "ApplyDiffHighlightsQuery");
        expect(afterHighlights?.added).toContain("Task_1");
    });

    it("names each side's file in its highlights, the git ref ignored", async () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store, beforeBpmn, afterBpmn);

        await service.markReady(before);
        await service.markReady(after);

        const paneFilenameOf = (handle: FakeDiffPaneHandle) =>
            handle.posted
                .map((m) => m as { type: string; paneFilename?: string })
                .find((m) => m.type === "ApplyDiffHighlightsQuery")?.paneFilename;
        expect(paneFilenameOf(before)).toBe("diagram.bpmn");
        expect(paneFilenameOf(after)).toBe("diagram.bpmn");
    });

    it.each<[string, ElementXmlChanges | undefined, boolean]>([
        [
            "offers an element's XML changes in the highlights when the host shows them",
            { show: async () => undefined, follow: async () => undefined },
            true,
        ],
        ["does not offer an element's XML changes on a host without them", undefined, false],
    ])("%s", async (_case, elementXml, offered) => {
        const { service, store } = createService(elementXml);
        const { before, after } = attachedPair(store, beforeBpmn, afterBpmn);

        await service.markReady(before);
        await service.markReady(after);

        for (const pane of [before, after]) {
            expect(pane.posted).toContainEqual(
                expect.objectContaining({
                    type: "ApplyDiffHighlightsQuery",
                    elementXmlChanges: offered,
                }),
            );
        }
    });

    it("logs and posts no highlights when computeDiff rejects on invalid XML", async () => {
        const { service, store, notifier } = createService();
        const { before, after } = attachedPair(store, "not valid bpmn xml", afterBpmn);

        await service.markReady(before);
        await service.markReady(after);

        expect(notifier.logged("error")).toHaveLength(1);
        expect(messageTypes(before)).not.toContain("ApplyDiffHighlightsQuery");
        expect(messageTypes(after)).not.toContain("ApplyDiffHighlightsQuery");
    });

    // ─── Language re-broadcast ──────────────────────────────────────────────────

    it("rebroadcastLanguage posts a LanguageQuery only to ready panes", () => {
        const { service, store } = createService();
        const { before, after } = attachedPair(store);
        before.setReady(); // after stays not-ready

        service.rebroadcastLanguage();

        expect(messageTypes(before)).toEqual(["LanguageQuery"]);
        expect(after.posted).toEqual([]);
    });
});
