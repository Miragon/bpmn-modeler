import { beforeEach, describe, expect, it, vi } from "vitest";

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
    let bpmnSync: ReturnType<typeof vi.fn>;
    let dmnSync: ReturnType<typeof vi.fn>;
    let logError: ReturnType<typeof vi.fn>;
    let listener: (event: unknown) => void;

    beforeEach(() => {
        onWillSaveTextDocumentMock.mockReset();
        getEditorIds = vi.fn(() => [] as string[]);
        requestFlush = vi.fn().mockResolvedValue(undefined);
        bpmnSync = vi.fn().mockResolvedValue(true);
        dmnSync = vi.fn().mockResolvedValue(true);
        logError = vi.fn();

        const controller = new DocumentSaveFlushController(
            { getEditorIds } as never,
            { requestFlush } as never,
            { sync: bpmnSync } as never,
            { sync: dmnSync } as never,
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
        requestFlush.mockResolvedValue("<xml/>");

        await fireSave(id).waited();

        expect(bpmnSync).toHaveBeenCalledWith(id, "<xml/>");
    });

    it("does not sync when the flush reports nothing pending", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue(undefined);

        await fireSave(id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .dmn document to the dmn service", async () => {
        const id = "file:///a.dmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue("<dmn/>");

        await fireSave(id).waited();

        expect(dmnSync).toHaveBeenCalledWith(id, "<dmn/>");
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("skips the sync when the editor closes mid-flush", async () => {
        const id = "file:///a.bpmn";
        // Tracked at save time, gone by the time the flush resolves.
        getEditorIds.mockReturnValueOnce([id]).mockReturnValue([]);
        requestFlush.mockResolvedValue("<xml/>");

        await fireSave(id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("never rejects the waitUntil promise even if the flush throws", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockRejectedValue(new Error("boom"));

        await expect(fireSave(id).waited()).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalled();
    });
});
