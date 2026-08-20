import { beforeEach, describe, expect, it, vi } from "vitest";

const onWillSaveTextDocumentMock = vi.fn();
const registerCommandMock = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        registerCommand: (...args: unknown[]) => registerCommandMock(...args),
    },
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
    let showError: ReturnType<typeof vi.fn>;
    let hostContent: string;
    let listener: (event: unknown) => void;
    let flushCommand: (editorId: string, viewType: string) => Promise<boolean | undefined>;

    beforeEach(() => {
        onWillSaveTextDocumentMock.mockReset();
        registerCommandMock.mockReset();
        registerCommandMock.mockReturnValue({ dispose: vi.fn() });
        getEditorIds = vi.fn(() => [] as string[]);
        requestFlush = vi.fn().mockResolvedValue({ status: "idle" });
        hostContent = "";
        bpmnSync = vi.fn(async (_editorId: string, content: string) => {
            hostContent = content;
            return true;
        });
        dmnSync = vi.fn(async (_editorId: string, content: string) => {
            hostContent = content;
            return true;
        });
        logError = vi.fn();
        showError = vi.fn();

        const controller = new DocumentSaveFlushController(
            { getEditorIds, requireHandle: () => ({ getContent: () => hostContent }) } as never,
            { requestFlush } as never,
            { sync: bpmnSync } as never,
            { sync: dmnSync } as never,
            { logError, showError } as never,
        );
        controller.register({ subscriptions: [] } as never);
        listener = onWillSaveTextDocumentMock.mock.calls[0][0] as (event: unknown) => void;
        flushCommand = registerCommandMock.mock.calls[0]?.[1] as (
            editorId: string,
            viewType: string,
        ) => Promise<boolean | undefined>;
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

    it("registers an internal command that flushes a tracked editor without saving", async () => {
        const id = "file:///a.BPMN?view=detached";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml/>" });

        expect(registerCommandMock).toHaveBeenCalledWith(
            "bpmn-modeler.flushDocument",
            expect.any(Function),
        );
        await expect(flushCommand(id, "bpmn-modeler.bpmn")).resolves.toBe(true);

        expect(requestFlush).toHaveBeenCalledWith(id);
        expect(bpmnSync).toHaveBeenCalledWith(id, "<xml/>");
    });

    it("reports a failed explicit flush so Theia can keep the secondary window open", async () => {
        const id = "file:///a.dmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "failed" });

        await expect(flushCommand(id, "bpmn-modeler.dmn")).resolves.toBe(false);

        expect(dmnSync).not.toHaveBeenCalled();
        expect(showError).toHaveBeenCalledOnce();
    });

    it("reports a failed buffer sync so Theia can keep the secondary window open", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml/>" });
        bpmnSync.mockResolvedValue(false);

        await expect(flushCommand(id, "bpmn-modeler.bpmn")).resolves.toBe(false);
    });

    it("accepts a byte-identical buffer when the guarded write no-ops", async () => {
        const id = "file:///a.bpmn";
        hostContent = "<xml/>";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml/>" });
        bpmnSync.mockResolvedValue(false);

        await expect(flushCommand(id, "bpmn-modeler.bpmn")).resolves.toBe(true);
    });

    it.each([
        ["file:///a.bpmn", "bpmn-modeler.bpmn", "bpmn"],
        ["file:///a.dmn", "bpmn-modeler.dmn", "dmn"],
    ])("accepts a %s buffer normalized to CRLF", async (id, viewType, modeler) => {
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml>\n</xml>" });
        const sync = modeler === "bpmn" ? bpmnSync : dmnSync;
        sync.mockImplementation(async (_editorId: string, content: string) => {
            hostContent = content.replaceAll("\n", "\r\n");
            return true;
        });

        await expect(flushCommand(id, viewType)).resolves.toBe(true);
    });

    it("flushes a tracked .bpmn and syncs the returned xml", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml/>" });

        await fireSave(id).waited();

        expect(bpmnSync).toHaveBeenCalledWith(id, "<xml/>");
    });

    it("does not sync when the flush reports nothing pending", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "idle" });

        await fireSave(id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("routes a .dmn document to the dmn service", async () => {
        const id = "file:///a.dmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<dmn/>" });

        await fireSave(id).waited();

        expect(dmnSync).toHaveBeenCalledWith(id, "<dmn/>");
        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("skips the sync when the editor closes mid-flush", async () => {
        const id = "file:///a.bpmn";
        // Tracked at save time, gone by the time the flush resolves.
        getEditorIds.mockReturnValueOnce([id]).mockReturnValue([]);
        requestFlush.mockResolvedValue({ status: "flushed", content: "<xml/>" });

        await fireSave(id).waited();

        expect(bpmnSync).not.toHaveBeenCalled();
    });

    it("never rejects the waitUntil promise even if the flush throws", async () => {
        const id = "file:///a.bpmn";
        getEditorIds.mockReturnValue([id]);
        requestFlush.mockRejectedValue(new Error("boom"));

        await expect(fireSave(id).waited()).resolves.toBe(false);
        expect(logError).toHaveBeenCalled();
    });
});
