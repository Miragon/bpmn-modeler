import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    window: { registerCustomEditorProvider: vi.fn() },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import { NavigateToReferencedModelCommand } from "@miragon/bpmn-modeler-shared";

import { BpmnEditorController } from "./BpmnEditorController";

type MessageCallback = (message: unknown, id: string) => Promise<void> | void;

function createController() {
    let capturedCallback: MessageCallback | undefined;

    const editorStore = {
        subscribeToMessageEvent: vi.fn((_editorId: string, cb: MessageCallback) => {
            capturedCallback = cb;
        }),
        getDocumentForEditor: vi.fn(),
    };

    const vsUI = {
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        showError: vi.fn(),
    };

    const modelNavigationService = { navigate: vi.fn().mockResolvedValue(undefined) };

    const controller = new BpmnEditorController(
        editorStore as never,
        {} as never, // bpmnService
        {} as never, // diffService
        {} as never, // artifactSvc
        {} as never, // scriptTaskSvc
        vsUI as never,
        {} as never, // vsDocument
        {} as never, // statusBar
        modelNavigationService as never,
    );

    // `subscribeToMessageEvent` is private — invoke it via bracket access so
    // the test exercises the real switch without driving the heavy
    // `resolveCustomTextEditor` flow (which would require artifactSvc etc.).
    (
        controller as unknown as {
            subscribeToMessageEvent(editorId: string): void;
        }
    ).subscribeToMessageEvent("file:///src/a.bpmn");

    if (!capturedCallback) {
        throw new Error("subscribeToMessageEvent did not register a callback");
    }
    return {
        callback: capturedCallback,
        editorStore,
        vsUI,
        modelNavigationService,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnEditorController — NavigateToReferencedModelCommand dispatch", () => {
    it("forwards a process-kind command to the service with the editor's document URI", async () => {
        const { callback, editorStore, modelNavigationService } = createController();
        const documentUri = {
            scheme: "file",
            path: "/src/a.bpmn",
            fsPath: "/src/a.bpmn",
        };
        editorStore.getDocumentForEditor.mockReturnValue({ uri: documentUri });

        const cmd = new NavigateToReferencedModelCommand("ProcessB", "process");
        await callback(cmd, "file:///src/a.bpmn");

        expect(editorStore.getDocumentForEditor).toHaveBeenCalledWith("file:///src/a.bpmn");
        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "ProcessB",
            "process",
            documentUri,
        );
    });

    it("forwards a decision-kind command unchanged", async () => {
        const { callback, editorStore, modelNavigationService } = createController();
        const documentUri = {
            scheme: "file",
            path: "/src/a.bpmn",
            fsPath: "/src/a.bpmn",
        };
        editorStore.getDocumentForEditor.mockReturnValue({ uri: documentUri });

        await callback(
            new NavigateToReferencedModelCommand("Decision_1", "decision"),
            "file:///src/a.bpmn",
        );

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "Decision_1",
            "decision",
            documentUri,
        );
    });

    it("rejects unknown referenceKind values with a logWarning and no service call", async () => {
        const { callback, vsUI, modelNavigationService } = createController();
        // Bypass the constructor's type check to simulate protocol drift /
        // a hostile webview sending an unexpected discriminant.
        const malformed = {
            type: "NavigateToReferencedModelCommand",
            referenceId: "X",
            referenceKind: "anything",
        };

        await callback(malformed, "file:///src/a.bpmn");

        expect(vsUI.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("unknown kind: anything"),
        );
        expect(modelNavigationService.navigate).not.toHaveBeenCalled();
    });
});
