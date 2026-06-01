import { beforeEach, describe, expect, it, vi } from "vitest";

// `DmnModelerService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { DmnModelerService } from "./DmnModelerService";
import { UserCancelledError } from "../../../shared/domain/errors";

const EDITOR = "file:///work/decision.dmn";
const DMN_DOC =
    '<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="d"/>';

function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const vsDocument = {
        getContent: vi.fn(),
        write: vi.fn().mockResolvedValue(true),
        save: vi.fn().mockResolvedValue(true),
    };
    const notifier = { logError: vi.fn(), showError: vi.fn() };

    const service = new DmnModelerService(
        editorStore as never,
        vsDocument as never,
        notifier as never,
    );

    return { service, editorStore, vsDocument, notifier };
}

// `postMessage(editorId, message)` — the message is the second argument.
const postedTypes = (editorStore: { postMessage: ReturnType<typeof vi.fn> }): string[] =>
    editorStore.postMessage.mock.calls.map(([, msg]) => (msg as { type: string }).type);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DmnModelerService.display", () => {
    it("renders an existing document untouched", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(DMN_DOC);

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1] as DmnFileQuery;
        expect(msg.type).toBe("DmnFileQuery");
        expect(msg.content).toBe(DMN_DOC);
        // Existing content must not be rewritten/saved.
        expect(vsDocument.write).not.toHaveBeenCalled();
        expect(vsDocument.save).not.toHaveBeenCalled();
    });

    it("seeds an empty document with the default DMN diagram before rendering", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(true);
        // The seeded XML is written, persisted, then posted to the webview.
        const seeded = vsDocument.write.mock.calls[0][1] as string;
        expect(seeded).toContain("DMN/20191111/MODEL");
        expect(vsDocument.save).toHaveBeenCalledWith(EDITOR);
        const msg = editorStore.postMessage.mock.calls[0][1] as DmnFileQuery;
        expect(msg.content).toBe(seeded);
    });

    it("skips rendering while a sync guard is held (echo prevention)", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(DMN_DOC);

        // Hold the guard by leaving the sync write pending, then race a display.
        let finishWrite: (applied: boolean) => void = () => {};
        vsDocument.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );
        const syncing = service.sync(EDITOR, "<xml/>");

        const rendered = await service.display(EDITOR);
        expect(rendered).toBe(false);
        expect(editorStore.postMessage).not.toHaveBeenCalled();

        finishWrite(true);
        await syncing;
    });

    it("returns false without notifying when the editor is hidden", async () => {
        const { service, editorStore, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(DMN_DOC);
        editorStore.postMessage.mockRejectedValue(new Error("The active editor is hidden."));

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.showError).not.toHaveBeenCalled();
        expect(notifier.logError).not.toHaveBeenCalled();
    });

    it("returns false without notifying when a UserCancelledError surfaces", async () => {
        const { service, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockImplementation(() => {
            throw new UserCancelledError();
        });

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.showError).not.toHaveBeenCalled();
        expect(notifier.logError).not.toHaveBeenCalled();
    });

    it("notifies and returns false on an unexpected error", async () => {
        const { service, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockImplementation(() => {
            throw new Error("boom");
        });

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(notifier.showError).toHaveBeenCalledOnce();
    });
});

describe("DmnModelerService.sync", () => {
    it("writes the content and releases the guard so later renders proceed", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(DMN_DOC);

        const synced = await service.sync(EDITOR, "<xml/>");
        expect(synced).toBe(true);
        expect(vsDocument.write).toHaveBeenCalledWith(EDITOR, "<xml/>");

        // Guard must have been released in the `finally`, so display is not skipped.
        await service.display(EDITOR);
        expect(postedTypes(editorStore)).toContain("DmnFileQuery");
    });

    it("notifies, returns false, and still releases the guard on a write error", async () => {
        const { service, editorStore, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.write.mockRejectedValueOnce(new Error("disk full"));
        vsDocument.getContent.mockReturnValue(DMN_DOC);

        const synced = await service.sync(EDITOR, "<xml/>");
        expect(synced).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(notifier.showError).toHaveBeenCalledOnce();

        // The failed write must not leave the guard stuck, or rendering would
        // be permanently skipped.
        await service.display(EDITOR);
        expect(postedTypes(editorStore)).toContain("DmnFileQuery");
    });
});

describe("DmnModelerService session lifecycle", () => {
    it("does not skip rendering for a disposed session", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        service.disposeSession(EDITOR);
        vsDocument.getContent.mockReturnValue(DMN_DOC);

        await service.display(EDITOR);

        expect(postedTypes(editorStore)).toContain("DmnFileQuery");
    });
});
