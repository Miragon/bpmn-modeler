import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentFlushResult } from "@miragon/bpmn-modeler-core";
import { createTestHost, TestHost } from "@miragon/bpmn-modeler-core/testing";

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
    let host: TestHost;
    let requestFlush: ReturnType<typeof vi.fn>;
    let bpmnSync: ReturnType<typeof vi.fn>;
    let dmnSync: ReturnType<typeof vi.fn>;
    let formSync: ReturnType<typeof vi.fn>;
    let logError: ReturnType<typeof vi.fn>;
    let releaseFlush: ReturnType<typeof vi.fn>;
    let listener: (event: unknown) => void;
    let controller: DocumentSaveFlushController;

    beforeEach(() => {
        onWillSaveTextDocumentMock.mockReset();
        host = createTestHost();
        requestFlush = vi.fn().mockResolvedValue({ status: "clean" });
        const sync = (editorId: string, content: string): Promise<boolean> =>
            host.documents.write(editorId, content);
        bpmnSync = vi.fn(sync);
        dmnSync = vi.fn(sync);
        formSync = vi.fn(sync);
        logError = vi.fn();
        releaseFlush = vi.fn();

        controller = new DocumentSaveFlushController(
            host.store,
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
        expect(fireSave("file:///x.bpmn").waited()).toBeUndefined();
    });

    it("flushes a tracked .bpmn and syncs the returned xml", async () => {
        const editor = host.openEditor("/a.bpmn");
        requestFlush.mockResolvedValue({
            status: "flushed",
            content: "<xml/>",
            documentRevision: 7,
        });

        await fireSave(editor.id).waited();

        expect(bpmnSync).toHaveBeenCalledWith(editor.id, "<xml/>", 7);
        expect(editor.content).toBe("<xml/>");
    });

    it("does not sync when the flush reports nothing pending", async () => {
        const editor = host.openEditor("/a.bpmn");
        requestFlush.mockResolvedValue({ status: "clean" });

        await fireSave(editor.id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("keeps an authoritative host update without draining stale webview work", async () => {
        const editor = host.openEditor("/a.bpmn");
        const waitForEditorQueue = vi.spyOn(host.store, "waitForEditorQueue");
        requestFlush.mockResolvedValue({ status: "host-updated" });

        await expect(fireSave(editor.id).waited()).resolves.toEqual({
            status: "safe",
            session: editor,
        });

        expect(waitForEditorQueue).not.toHaveBeenCalled();
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .dmn document to the dmn service", async () => {
        const editor = host.openEditor("/a.dmn");
        requestFlush.mockResolvedValue({ status: "flushed", content: "<dmn/>" });

        await fireSave(editor.id).waited();

        expect(dmnSync).toHaveBeenCalledWith(editor.id, "<dmn/>", undefined);
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .form document to the form service", async () => {
        const editor = host.openEditor("/a.form");
        requestFlush.mockResolvedValue({ status: "flushed", content: '{"id":"Form_1"}' });

        await fireSave(editor.id).waited();

        expect(formSync).toHaveBeenCalledWith(editor.id, '{"id":"Form_1"}', undefined);
        expect(bpmnSync).not.toHaveBeenCalled();
        expect(dmnSync).not.toHaveBeenCalled();
    });

    it("waits for an already-posted form sync when the flush reports nothing pending", async () => {
        const editor = host.openEditor("/a.form");
        let finishSync: () => void = () => {};
        const pendingSync = new Promise<void>((resolve) => {
            finishSync = resolve;
        });
        void host.store.runInEditorQueue(editor.id, () => pendingSync);
        const waitForEditorQueue = vi.spyOn(host.store, "waitForEditorQueue");
        requestFlush.mockResolvedValue({ status: "clean" });

        const saving = fireSave(editor.id).waited();
        let saveFinished = false;
        void saving?.then(() => {
            saveFinished = true;
        });
        await vi.waitFor(() => expect(waitForEditorQueue).toHaveBeenCalledWith(editor.id));
        expect(saveFinished).toBe(false);

        finishSync();
        await saving;

        expect(saveFinished).toBe(true);
        expect(formSync).not.toHaveBeenCalled();
    });

    it("does not confirm clean when the latest normal sync missed the host document", async () => {
        const editor = host.openEditor("/a.form", '{"id":"old"}');
        host.store.recordDocumentSync(editor.id, editor, '{"id":"newer"}');
        requestFlush.mockResolvedValue({ status: "clean" });

        await expect(fireSave(editor.id).waited()).resolves.toEqual({ status: "unavailable" });
    });

    it("rejects a late flush result when the original editor session was replaced", async () => {
        const editor = host.openEditor("/a.bpmn");
        let resolveFlush!: (result: DocumentFlushResult) => void;
        requestFlush.mockReturnValue(
            new Promise((resolve) => {
                resolveFlush = resolve;
            }),
        );

        const saving = fireSave(editor.id).waited();
        host.openEditor("/a.bpmn");
        resolveFlush({ status: "flushed", content: "<xml/>" });

        await expect(saving).resolves.toEqual({ status: "closed" });

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("reports unavailable without syncing when the webview cannot confirm the flush", async () => {
        const editor = host.openEditor("/a.form");
        const waitForEditorQueue = vi.spyOn(host.store, "waitForEditorQueue");
        requestFlush.mockResolvedValue({ status: "unavailable" });

        await expect(fireSave(editor.id).waited()).resolves.toEqual({ status: "unavailable" });

        expect(waitForEditorQueue).toHaveBeenCalledWith(editor.id);
        expect(formSync).not.toHaveBeenCalled();
    });

    it("requests a destructive lock and releases it when verification fails", async () => {
        const editor = host.openEditor("/a.bpmn", "<other/>");
        requestFlush.mockResolvedValue({ status: "flushed", content: "<stable/>" });
        bpmnSync.mockResolvedValue(false);

        await expect(controller.flush(editor.id, true)).resolves.toEqual({
            status: "unavailable",
        });

        expect(requestFlush).toHaveBeenCalledWith(editor.id, { destructive: true });
        expect(releaseFlush).toHaveBeenCalledWith(editor.id, editor);
    });

    it("never rejects the waitUntil promise even if the flush throws", async () => {
        const editor = host.openEditor("/a.bpmn");
        requestFlush.mockRejectedValue(new Error("boom"));

        await expect(fireSave(editor.id).waited()).resolves.toEqual({ status: "unavailable" });
        expect(logError).toHaveBeenCalled();
    });
});
