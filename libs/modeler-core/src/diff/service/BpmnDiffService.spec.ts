import { describe, expect, it } from "vitest";

import {
    createTestHost,
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    RecordingMergeSidesView,
} from "../../testing";
import { DiffPaneStore } from "./DiffPaneStore";
import { BpmnDiffService, ElementXmlChanges } from "./BpmnDiffService";
import { DiffSession } from "./DiffSession";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSessionStore } from "./MergeSessionStore";

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

/** A merge view's diff session with both panes attached, served by a service that knows it. */
async function mergeView() {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const merges = new MergeSessionStore(store, new RecordingMergeSidesView());
    const service = new BpmnDiffService(
        notifier,
        settings,
        store,
        undefined,
        new MergeDecisionService(merges, notifier),
    );
    const uris = {
        current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
        incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
    };
    const session = store.registerMerge(uris);
    merges.add(
        await mergeSessionOf({
            fileUri: "file:///repo/order.bpmn",
            fileName: "order.bpmn",
            title: "order.bpmn (Merge: main ↔ feature)",
            captions: {
                current: { side: "current", role: "branch", ref: "main" },
                incoming: { side: "incoming", role: "upstream", ref: "feature" },
            },
            uris,
            stages: ORDER_MERGE_STAGES,
        }),
        session,
    );
    const current = fakeHandle(uris.current, ORDER_MERGE_STAGES.current);
    const incoming = fakeHandle(uris.incoming, ORDER_MERGE_STAGES.incoming);
    session.attachPane(current);
    session.attachPane(incoming);
    return { service, current, incoming };
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

    it("lists as each pane's added and removed exactly the changes only its version has", async () => {
        const versionWith = (
            task: string,
            keptName: string,
        ) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="${task}" />
    <bpmn:task id="Task_Kept" name="${keptName}" />
  </bpmn:process>
</bpmn:definitions>`;
        const { service, store } = createService();
        const { before, after } = attachedPair(
            store,
            versionWith("Task_Old", "Check"),
            versionWith("Task_New", "Check order"),
        );

        await service.markReady(before);
        await service.markReady(after);

        const onlyThisVersionHas = (handle: FakeDiffPaneHandle) => {
            const highlights = handle.posted
                .map((m) => m as { type: string; added?: string[]; removed?: string[] })
                .find((m) => m.type === "ApplyDiffHighlightsQuery");
            return { added: highlights?.added, removed: highlights?.removed };
        };
        expect(onlyThisVersionHas(before)).toEqual({ added: [], removed: ["Task_Old"] });
        expect(onlyThisVersionHas(after)).toEqual({ added: ["Task_New"], removed: [] });
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

    it("serves a merge pane in merge viewer mode", async () => {
        const { service, current } = await mergeView();

        await service.sendViewerFile(current);

        expect(current.posted).toEqual([
            expect.objectContaining({ type: "BpmnFileQuery", viewerMode: "merge" }),
        ]);
    });

    it("sends a merge view's panes their merge states, not diff highlights", async () => {
        const { service, current, incoming } = await mergeView();

        await service.markReady(current);
        await service.markReady(incoming);

        expect(messageTypes(current)).toEqual(["LanguageQuery", "ApplyMergeStatesQuery"]);
        expect(messageTypes(incoming)).toEqual(["LanguageQuery", "ApplyMergeStatesQuery"]);
    });

    it("still runs the plain diff for scm and compare-files sessions", async () => {
        const { service, store } = createService();
        const scmBefore = fakeHandle("git:/repo/scm.bpmn?ref=HEAD", beforeBpmn);
        const scmAfter = fakeHandle("file:///repo/scm.bpmn", afterBpmn);
        const scm = DiffSession.forScm(scmBefore, scmAfter);
        scm.attachPane(scmBefore);
        scm.attachPane(scmAfter);
        store.index(scm);
        const compare = attachedPair(store, beforeBpmn, afterBpmn);

        for (const { before, after } of [compare, { before: scmBefore, after: scmAfter }]) {
            await service.sendViewerFile(before);
            await service.markReady(before);
            await service.markReady(after);

            expect(before.posted[0]).toMatchObject({ type: "BpmnFileQuery", viewerMode: "viewer" });
            expect(messageTypes(after)).toContain("ApplyDiffHighlightsQuery");
            expect(messageTypes(after)).not.toContain("ApplyMergeStatesQuery");
        }
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
