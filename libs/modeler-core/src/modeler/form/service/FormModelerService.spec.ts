import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormFileQuery } from "@miragon/bpmn-modeler-shared";

import { FormModelerService } from "./FormModelerService";

const EDITOR = "file:///work/request.form";
const FORM = '{"components":[],"type":"default","id":"Form_Request"}';

function createService() {
    let documentRevision = 0;
    const editorSession = {};
    const editorStore = {
        postMessage: vi.fn().mockResolvedValue(true),
        markHostDocumentUpdated: vi.fn(() => ++documentRevision),
        currentHostDocumentRevision: vi.fn(() => documentRevision),
        isHostDocumentRevisionCurrent: vi.fn(
            (_editorId: string, revision?: number) => (revision ?? 0) === documentRevision,
        ),
        captureEditorSession: vi.fn(() => editorSession),
        isCurrentEditorSession: vi.fn(
            (_editorId: string, session: object) => session === editorSession,
        ),
    };
    const document = {
        getContent: vi.fn(),
        write: vi.fn().mockResolvedValue(true),
        save: vi.fn().mockResolvedValue(true),
    };
    const notifier = { notifyError: vi.fn() };
    const service = new FormModelerService(
        editorStore as never,
        document as never,
        notifier as never,
    );
    return { service, editorStore, document, notifier };
}

beforeEach(() => vi.clearAllMocks());

describe("FormModelerService", () => {
    it("renders existing content without rewriting it", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue(FORM);

        expect(await service.display(EDITOR)).toBe(true);
        expect(editorStore.postMessage).toHaveBeenCalledWith(EDITOR, new FormFileQuery(FORM));
        expect(document.write).not.toHaveBeenCalled();
        expect(document.save).not.toHaveBeenCalled();
    });

    it("seeds and saves an empty form before rendering", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("");

        expect(await service.display(EDITOR)).toBe(true);
        const emptyForm = document.write.mock.calls[0][1] as string;
        expect(document.write).toHaveBeenCalledWith(EDITOR, emptyForm, 0);
        expect(JSON.parse(emptyForm)).toEqual(
            expect.objectContaining({ id: expect.stringMatching(/^Form_[A-Za-z0-9]{8}$/) }),
        );
        expect(document.save).toHaveBeenCalledWith(EDITOR);
        expect(editorStore.postMessage).toHaveBeenCalledWith(EDITOR, new FormFileQuery(emptyForm));
    });

    it("does not render or save a fallback form when its host write is rejected", async () => {
        const { service, editorStore, document, notifier } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("");
        document.write.mockResolvedValueOnce(false);

        expect(await service.display(EDITOR)).toBe(false);
        expect(document.save).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("uses one form id when blank initialization overlaps", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("");
        let finishWrite: (changed: boolean) => void = () => {};
        document.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );

        const firstDisplay = service.display(EDITOR);

        expect(await service.display(EDITOR)).toBe(false);
        expect(document.write).toHaveBeenCalledOnce();
        finishWrite(true);
        expect(await firstDisplay).toBe(true);

        const emptyForm = document.write.mock.calls[0][1] as string;
        expect(editorStore.postMessage).toHaveBeenCalledOnce();
        expect(editorStore.postMessage).toHaveBeenCalledWith(EDITOR, new FormFileQuery(emptyForm));
    });

    it("supersedes blank initialization after a host update", async () => {
        const { service, editorStore, document, notifier } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("");
        let finishFirstWrite: (changed: boolean) => void = () => {};
        document.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishFirstWrite = resolve;
            }),
        );

        const firstDisplay = service.display(EDITOR);

        expect(await service.display(EDITOR, true)).toBe(true);
        finishFirstWrite(false);
        expect(await firstDisplay).toBe(false);

        const updatedForm = document.write.mock.calls[1][1] as string;
        expect(editorStore.markHostDocumentUpdated).toHaveBeenCalledWith(EDITOR);
        expect(document.write).toHaveBeenCalledTimes(2);
        expect(document.save).toHaveBeenCalledOnce();
        expect(editorStore.postMessage).toHaveBeenCalledOnce();
        expect(editorStore.postMessage).toHaveBeenCalledWith(
            EDITOR,
            new FormFileQuery(updatedForm, 1),
        );
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });

    it("does not save or render an initialized form into a replacement session", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("");
        let finishWrite: (changed: boolean) => void = () => {};
        document.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );

        const displaying = service.display(EDITOR);
        editorStore.isCurrentEditorSession.mockReturnValue(false);
        finishWrite(true);

        expect(await displaying).toBe(false);
        expect(document.save).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });

    it("suppresses the matching document-change echo while syncing", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue("<xml/>");
        let finishWrite: (value: boolean) => void = () => {};
        document.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );

        const syncing = service.sync(EDITOR, "<xml/>");
        expect(await service.display(EDITOR)).toBe(false);
        expect(editorStore.postMessage).not.toHaveBeenCalled();
        finishWrite(true);
        await syncing;
    });

    it("releases the guard and reports a failed sync", async () => {
        const { service, editorStore, document, notifier } = createService();
        service.registerSession(EDITOR);
        document.write.mockRejectedValueOnce(new Error("write failed"));
        document.getContent.mockReturnValue(FORM);

        expect(await service.sync(EDITOR, FORM)).toBe(false);
        expect(notifier.notifyError).toHaveBeenCalledOnce();
        await service.display(EDITOR);
        expect(editorStore.postMessage).toHaveBeenCalledOnce();
    });

    it("rejects content exported from an older host document revision", async () => {
        const { service, editorStore, document } = createService();
        service.registerSession(EDITOR);
        document.getContent.mockReturnValue(FORM);
        await service.display(EDITOR, true);

        expect((editorStore.postMessage.mock.calls[0][1] as FormFileQuery).documentRevision).toBe(
            1,
        );
        expect(await service.sync(EDITOR, "{}", 0)).toBe(false);
        expect(document.write).not.toHaveBeenCalled();
    });
});
