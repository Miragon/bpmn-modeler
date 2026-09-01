import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentFlushResult } from "@miragon/bpmn-modeler-core";

// Only `workspace.onWillSaveTextDocument` is touched at runtime; the hoisted spy
// lets the (hoisted) `vi.mock` factory close over it while keeping it assertable.
const onWillSaveTextDocumentMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        onWillSaveTextDocument: (...args: unknown[]) => onWillSaveTextDocumentMock(...args),
    },
}));

import { DocumentSaveFlushController } from "./DocumentSaveFlushController";

/**
 * Verifies the save hook's routing and its "never surface a save error" contract
 * without a real VS Code host: the captured `onWillSaveTextDocument` listener is
 * fired with a stub event whose `waitUntil` records the promise the controller
 * hands back.
 */
describe("DocumentSaveFlushController", () => {
    let getEditorIds: ReturnType<typeof vi.fn>;
    let requestFlush: ReturnType<typeof vi.fn>;
    let runInEditorQueue: ReturnType<typeof vi.fn>;
    let waitForEditorQueue: ReturnType<typeof vi.fn>;
    let bpmnSync: ReturnType<typeof vi.fn>;
    let dmnSync: ReturnType<typeof vi.fn>;
    let formSync: ReturnType<typeof vi.fn>;
    let logError: ReturnType<typeof vi.fn>;
    let captureEditorSession: ReturnType<typeof vi.fn>;
    let isCurrentEditorSession: ReturnType<typeof vi.fn>;
    let isLatestDocumentSyncApplied: ReturnType<typeof vi.fn>;
    let documentMatches: ReturnType<typeof vi.fn>;
    let recordDocumentSync: ReturnType<typeof vi.fn>;
    let releaseFlush: ReturnType<typeof vi.fn>;
    let documentContent: string;
    let listener: (event: unknown) => void;
    let controller: DocumentSaveFlushController;
    const session = {};

    beforeEach(() => {
        onWillSaveTextDocumentMock.mockReset();
        getEditorIds = vi.fn(() => [] as string[]);
        requestFlush = vi.fn().mockResolvedValue({ status: "clean" });
        runInEditorQueue = vi.fn(async (_editorId: string, task: () => Promise<unknown>) => task());
        waitForEditorQueue = vi.fn().mockResolvedValue(undefined);
        documentContent = "";
        const sync = async (_editorId: string, content: string): Promise<boolean> => {
            documentContent = content;
            return true;
        };
        bpmnSync = vi.fn(sync);
        dmnSync = vi.fn(sync);
        formSync = vi.fn(sync);
        logError = vi.fn();
        captureEditorSession = vi.fn().mockReturnValue(session);
        isCurrentEditorSession = vi.fn().mockReturnValue(true);
        isLatestDocumentSyncApplied = vi.fn().mockReturnValue(true);
        documentMatches = vi.fn((_editorId, _session, content) => content === documentContent);
        recordDocumentSync = vi.fn();
        releaseFlush = vi.fn();

        controller = new DocumentSaveFlushController(
            {
                getEditorIds,
                runInEditorQueue,
                waitForEditorQueue,
                captureEditorSession,
                isCurrentEditorSession,
                isLatestDocumentSyncApplied,
                documentMatches,
                recordDocumentSync,
                requireHandle: vi.fn(() => ({ getContent: () => documentContent })),
            } as never,
            { requestFlush, releaseFlush } as never,
            { sync: bpmnSync } as never,
            { sync: dmnSync } as never,
            { sync: formSync } as never,
            { logError } as never,
        );
        controller.register({ subscriptions: [] } as never);
        listener = onWillSaveTextDocumentMock.mock.calls[0][0] as (event: unknown) => void;
    });

    /** Fires the save listener and returns the promise handed to `waitUntil`, if any. */
    function fireSave(uri: string): { waited: () => Promise<unknown> | undefined } {
        let captured: Promise<unknown> | undefined;
        listener({
            document: { uri: { toString: () => uri } },
            waitUntil: (p: Promise<unknown>) => {
                captured = p;
            },
        });
        return { waited: () => captured };
    }

    it("does not call waitUntil for an untracked document", () => {
        getEditorIds.mockReturnValue([]);

        expect(fireSave("file:///x.bpmn").waited()).toBeUndefined();
    });

    it("flushes a tracked .bpmn and syncs the returned xml", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({
            status: "flushed",
            content: "<xml/>",
            documentRevision: 7,
        });

        await fireSave(id).waited();

        expect(bpmnSync).toHaveBeenCalledWith(id, "<xml/>", 7);
    });

    it("does not sync when the flush reports nothing pending", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "clean" });

        await fireSave(id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("keeps an authoritative host update without draining stale webview work", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "host-updated" });

        await expect(fireSave(id).waited()).resolves.toEqual({ status: "safe", session });

        expect(waitForEditorQueue).not.toHaveBeenCalled();
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .dmn document to the dmn service", async () => {
        const id = "file:///a.dmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<dmn/>" });

        await fireSave(id).waited();

        expect(dmnSync).toHaveBeenCalledWith(id, "<dmn/>", undefined);
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .form document to the form service", async () => {
        const id = "file:///a.form";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: '{"id":"Form_1"}' });

        await fireSave(id).waited();

        expect(formSync).toHaveBeenCalledWith(id, '{"id":"Form_1"}', undefined);
        expect(bpmnSync).not.toHaveBeenCalled();
        expect(dmnSync).not.toHaveBeenCalled();
    });

    it("waits for an already-posted form sync when the flush reports nothing pending", async () => {
        const id = "file:///a.form";
        let finishSync: () => void = () => {};
        const pendingSync = new Promise<void>((resolve) => {
            finishSync = resolve;
        });
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "clean" });
        waitForEditorQueue.mockReturnValue(pendingSync);

        const saving = fireSave(id).waited();
        let saveFinished = false;
        void saving?.then(() => {
            saveFinished = true;
        });
        await vi.waitFor(() => expect(waitForEditorQueue).toHaveBeenCalledWith(id));
        expect(saveFinished).toBe(false);

        finishSync();
        await saving;

        expect(saveFinished).toBe(true);
        expect(formSync).not.toHaveBeenCalled();
    });

    it("does not confirm clean when the latest normal sync missed the host document", async () => {
        const id = "file:///a.form";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "clean" });
        isLatestDocumentSyncApplied.mockReturnValue(false);

        await expect(fireSave(id).waited()).resolves.toEqual({ status: "unavailable" });
    });

    it("rejects a late flush result when the original editor session was replaced", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        let resolveFlush!: (result: DocumentFlushResult) => void;
        requestFlush.mockReturnValue(
            new Promise((resolve) => {
                resolveFlush = resolve;
            }),
        );

        const saving = fireSave(id).waited();
        isCurrentEditorSession.mockReturnValue(false);
        resolveFlush({ status: "flushed", content: "<xml/>" });

        await expect(saving).resolves.toEqual({ status: "closed" });

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("reports unavailable without syncing when the webview cannot confirm the flush", async () => {
        const id = "file:///a.form";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "unavailable" });

        await expect(fireSave(id).waited()).resolves.toEqual({ status: "unavailable" });

        expect(waitForEditorQueue).toHaveBeenCalledWith(id);
        expect(formSync).not.toHaveBeenCalled();
    });

    it("requests a destructive lock and releases it when verification fails", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<stable/>" });
        documentMatches.mockReturnValue(false);

        await expect(controller.flush(id, true)).resolves.toEqual({ status: "unavailable" });

        expect(requestFlush).toHaveBeenCalledWith(id, { destructive: true });
        expect(releaseFlush).toHaveBeenCalledWith(id, session);
    });

    it("never rejects the waitUntil promise even if the flush throws", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockRejectedValue(new Error("boom"));

        await expect(fireSave(id).waited()).resolves.toEqual({ status: "unavailable" });
        expect(logError).toHaveBeenCalled();
    });
});
