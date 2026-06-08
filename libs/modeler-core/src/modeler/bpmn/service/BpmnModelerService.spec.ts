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
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const vsDocument = {
        getContent: vi.fn(),
        write: vi.fn().mockResolvedValue(true),
        save: vi.fn().mockResolvedValue(true),
    };
    const picker = {
        pickExecutionPlatform: vi.fn(),
        pickEngineVersion: vi.fn(),
    };
    const statusBar = { showEngineVersion: vi.fn() };
    const notifier = { notifyError: vi.fn() };

    const service = new BpmnModelerService(
        editorStore as never,
        vsDocument as never,
        picker as never,
        statusBar as never,
        notifier as never,
    );

    return { service, editorStore, vsDocument, picker, statusBar, notifier };
}

// `postMessage(editorId, message)` — the message is the second argument.
const postedTypes = (editorStore: { postMessage: ReturnType<typeof vi.fn> }): string[] =>
    editorStore.postMessage.mock.calls.map(([, msg]) => (msg as { type: string }).type);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnModelerService.display", () => {
    it("renders a valid document and shows its engine version", async () => {
        const { service, editorStore, vsDocument, statusBar } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        const rendered = await service.display(EDITOR);

        expect(rendered).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.type).toBe("BpmnFileQuery");
        expect(msg.engine).toBe("c8");
        expect(statusBar.showEngineVersion).toHaveBeenCalledWith("c8", "8.8.0");
    });

    it("seeds an empty document with the picked platform before rendering", async () => {
        const { service, editorStore, vsDocument, picker } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue("");
        picker.pickExecutionPlatform.mockResolvedValue("c7");

        await service.display(EDITOR);

        expect(vsDocument.write).toHaveBeenCalledOnce();
        expect(vsDocument.save).toHaveBeenCalledWith(EDITOR);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.engine).toBe("c7");
    });

    it("re-prompts for a platform when none can be detected, then upgrades the XML", async () => {
        const { service, editorStore, vsDocument, picker, statusBar } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(NO_PLATFORM_DOC);
        picker.pickExecutionPlatform.mockResolvedValue("c7");

        await service.display(EDITOR);

        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnFileQuery;
        expect(msg.content).toContain('modeler:executionPlatformVersion="7.24.0"');
        expect(msg.content).toContain("camunda");
        expect(statusBar.showEngineVersion).toHaveBeenCalledWith("c7", "7.24.0");
        // The upgraded XML is written back to the document.
        expect(vsDocument.write).toHaveBeenCalledWith(EDITOR, msg.content);
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
        picker.pickExecutionPlatform.mockRejectedValue(new UserCancelledError());

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

    it("skips rendering while a sync guard is held (echo prevention)", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

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
});

describe("BpmnModelerService.sync", () => {
    it("writes the content and releases the guard so later renders proceed", async () => {
        const { service, editorStore, vsDocument } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);

        const synced = await service.sync(EDITOR, "<xml/>");
        expect(synced).toBe(true);
        expect(vsDocument.write).toHaveBeenCalledWith(EDITOR, "<xml/>");

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

    it("returns false without notifying when the version prompt is cancelled", async () => {
        const { service, vsDocument, picker, notifier } = createService();
        service.registerSession(EDITOR);
        vsDocument.getContent.mockReturnValue(C8_DOC);
        picker.pickEngineVersion.mockRejectedValue(new UserCancelledError());

        const result = await service.changeEngineVersion(EDITOR);

        expect(result).toBe(false);
        expect(notifier.notifyError).not.toHaveBeenCalled();
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
