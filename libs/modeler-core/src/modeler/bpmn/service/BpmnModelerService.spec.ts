import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnModelerService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnModelerService } from "./BpmnModelerService";
import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import { UserCancelledError } from "../../../shared/domain/errors";

const EDITOR = "file:///work/diagram.bpmn";

// Real, valid documents so detection/version extraction run the production code.
const C8_DOC = BpmnDocument.empty("c8", "8.8.0").xml;
// Non-empty but carries no platform signal → `detectPlatform` throws.
const NO_PLATFORM_DOC =
    '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://x" id="d"><bpmn:process id="P"/></bpmn:definitions>';

function createService() {
    let documentRevision = 0;
    let editorSession: object = {};
    const editorStore = {
        postMessage: vi.fn().mockResolvedValue(true),
        markHostDocumentUpdated: vi.fn((_editorId: string) => ++documentRevision),
        currentHostDocumentRevision: vi.fn(() => documentRevision),
        isHostDocumentRevisionCurrent: vi.fn(
            (_editorId: string, revision?: number) => (revision ?? 0) === documentRevision,
        ),
        captureEditorSession: vi.fn(() => editorSession),
        isCurrentEditorSession: vi.fn(
            (_editorId: string, captured: object) => captured === editorSession,
        ),
    };
    const vsDocument = {
        getContent: vi.fn(),
        write: vi.fn().mockResolvedValue(true),
        save: vi.fn().mockResolvedValue(true),
    };
    const picker = {
        pickNewModelEngine: vi.fn(),
        pickEngineVersion: vi.fn(),
    };
    const statusBar = { showEngineVersion: vi.fn(), hideEngineVersion: vi.fn() };
    const notifier = { notifyError: vi.fn(), showInfo: vi.fn() };
    const settings = { getDefaultMode: vi.fn(() => "implement") };

    const service = new BpmnModelerService(
        editorStore as never,
        vsDocument as never,
        picker as never,
        statusBar as never,
        notifier as never,
        settings as never,
    );

    return {
        service,
        editorStore,
        vsDocument,
        picker,
        statusBar,
        notifier,
        settings,
        replaceEditorSession: () => {
            editorSession = {};
        },
    };
}

// `postMessage(editorId, message)` — the message is the second argument.
const postedTypes = (editorStore: { postMessage: ReturnType<typeof vi.fn> }): string[] =>
    editorStore.postMessage.mock.calls.map(([, msg]) => (msg as { type: string }).type);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnModelerService.display", () => {
    it("renders a valid document and shows its engine version", async () => {
        const { service, editorStore, vsDocument, statusBar, settings } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.type).toBe("BpmnFileQuery");
        expect(msg.engine).toBe("c8");
        expect(msg.defaultMode).toBe("implement");
        expect(settings.getDefaultMode).toHaveBeenCalled();
        expect(statusBar.showEngineVersion).toHaveBeenCalledWith("c8", "8.8.0");
    });

    it("seeds an empty document with the picked platform before rendering", async () => {
        const { service, editorStore, vsDocument, picker } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");
        picker.pickNewModelEngine.mockResolvedValue("c7");

        await service.display(EDITOR);

        expect(vsDocument.write).toHaveBeenCalledOnce();
        expect(vsDocument.write.mock.calls[0][2]).toBe(0);
        expect(vsDocument.save).toHaveBeenCalledWith(EDITOR);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.engine).toBe("c7");
    });

    it("routes an untagged document to an engine-neutral render without rewriting it", async () => {
        const { service, editorStore, vsDocument, statusBar } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(NO_PLATFORM_DOC);

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.engine).toBeUndefined();
        expect(msg.content).toBe(NO_PLATFORM_DOC);
        expect(statusBar.hideEngineVersion).toHaveBeenCalled();
        expect(statusBar.showEngineVersion).not.toHaveBeenCalled();
        // No stamp-on-open: the untagged document is never written back.
        expect(vsDocument.write).not.toHaveBeenCalled();
    });

    it("scaffolds an engine-neutral document when the neutral choice is picked", async () => {
        const { service, editorStore, vsDocument, picker } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");
        picker.pickNewModelEngine.mockResolvedValue("neutral");

        await service.display(EDITOR);

        expect(vsDocument.write).toHaveBeenCalledOnce();
        const written = vsDocument.write.mock.calls[0][1] as string;
        expect(written).not.toContain("modeler:executionPlatform");
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.engine).toBeUndefined();
    });

    it("returns false without notifying when the editor is hidden", async () => {
        const { service, editorStore, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        editorStore.postMessage.mockRejectedValue(new Error("The active editor is hidden."));

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });

    it("returns false without notifying when the user cancels the platform prompt", async () => {
        const { service, vsDocument, picker, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");
        picker.pickNewModelEngine.mockRejectedValue(new UserCancelledError());

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });

    it("notifies and returns false on an unexpected error", async () => {
        const { service, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockImplementation(() => {
            throw new Error("boom");
        });

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(false);
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("skips the matching document-change echo while a sync write is pending", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("<xml/>");

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

    it("renders and revisions a different host edit while a sync write is pending", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        let finishWrite: (applied: boolean) => void = () => {};
        vsDocument.write.mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );
        const syncing = service.sync(EDITOR, "<webview/>", 0);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        expect(await service.display(EDITOR, true)).toBe(true);
        expect(editorStore.markHostDocumentUpdated).toHaveBeenCalledWith(EDITOR);
        expect((editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery).documentRevision).toBe(
            1,
        );

        finishWrite(false);
        await syncing;
    });

    it("does not seed an empty document after the host revision changes during the prompt", async () => {
        const { service, editorStore, vsDocument, picker } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");
        let finishPick: (platform: "c7") => void = () => {};
        picker.pickNewModelEngine.mockReturnValueOnce(
            new Promise((resolve) => {
                finishPick = resolve;
            }),
        );

        const displaying = service.display(EDITOR);
        editorStore.markHostDocumentUpdated(EDITOR);
        finishPick("c7");

        expect(await displaying).toBe(false);
        expect(vsDocument.write).not.toHaveBeenCalled();
        expect(vsDocument.save).not.toHaveBeenCalled();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });
});

describe("BpmnModelerService.sync", () => {
    it("writes the content and releases the guard so later renders proceed", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        const synced = await service.sync(EDITOR, "<xml/>");
        expect(synced).toBe(true);
        expect(vsDocument.write).toHaveBeenCalledWith(EDITOR, "<xml/>", undefined);

        // Guard must have been released in the `finally`, so display is not skipped.
        await service.display(EDITOR);
        expect(postedTypes(editorStore)).toContain("BpmnFileQuery");
    });

    it("notifies, returns false, and still releases the guard on a write error", async () => {
        const { service, editorStore, vsDocument, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.write.mockRejectedValueOnce(new Error("disk full"));
        vsDocument.getContent.mockReturnValue(C8_DOC);

        const synced = await service.sync(EDITOR, "<xml/>");
        expect(synced).toBe(false);
        expect(notifier.notifyError).toHaveBeenCalledOnce();

        // The failed write must not leave the guard stuck, or rendering would
        // be permanently skipped.
        await service.display(EDITOR);
        expect(postedTypes(editorStore)).toContain("BpmnFileQuery");
    });

    it("rejects content exported from an older host document revision", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        await service.display(EDITOR, true);

        expect((editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery).documentRevision).toBe(
            1,
        );
        expect(await service.sync(EDITOR, "<stale/>", 0)).toBe(false);
        expect(vsDocument.write).not.toHaveBeenCalled();
    });
});

describe("BpmnModelerService.changeEngineVersion", () => {
    it("writes the picked version, updates the status bar, and re-renders", async () => {
        const { service, vsDocument, picker, statusBar } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        picker.pickEngineVersion.mockResolvedValue("8.5.0");

        await service.changeEngineVersion(EDITOR);

        const writtenXml = vsDocument.write.mock.calls[0][1] as string;
        expect(writtenXml).toContain('modeler:executionPlatformVersion="8.5.0"');
        expect(statusBar.showEngineVersion).toHaveBeenCalledWith("c8", "8.5.0");
    });

    it("informs and returns false for an untagged diagram with no engine version", async () => {
        const { service, vsDocument, picker, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(NO_PLATFORM_DOC);

        const result = await service.changeEngineVersion(EDITOR);

        expect(result).toBe(false);
        expect(notifier.showInfo).toHaveBeenCalledOnce();
        expect(picker.pickEngineVersion).not.toHaveBeenCalled();
        expect(vsDocument.write).not.toHaveBeenCalled();
    });

    it("returns false without notifying when the version prompt is cancelled", async () => {
        const { service, vsDocument, picker, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        picker.pickEngineVersion.mockRejectedValue(new UserCancelledError());

        const result = await service.changeEngineVersion(EDITOR);

        expect(result).toBe(false);
        expect(notifier.notifyError).not.toHaveBeenCalled();
    });

    it("does not apply a picked version to a replacement same-uri session", async () => {
        const { service, vsDocument, picker, statusBar, replaceEditorSession } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        let finishPick: (version: string) => void = () => {};
        picker.pickEngineVersion.mockReturnValueOnce(
            new Promise((resolve) => {
                finishPick = resolve;
            }),
        );

        const changing = service.changeEngineVersion(EDITOR);
        replaceEditorSession();
        finishPick("8.5.0");

        expect(await changing).toBe(false);
        expect(vsDocument.write).not.toHaveBeenCalled();
        expect(statusBar.showEngineVersion).not.toHaveBeenCalled();
    });
});

describe("BpmnModelerService session lifecycle", () => {
    it("does not skip rendering for a disposed session", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        service.disposeSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        await service.display(EDITOR);

        expect(postedTypes(editorStore)).toContain("BpmnFileQuery");
    });
});
