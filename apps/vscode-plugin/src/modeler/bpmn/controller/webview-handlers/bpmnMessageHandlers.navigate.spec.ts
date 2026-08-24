import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import {
    GetFormReferenceStatusCommand,
    NavigateToReferencedModelCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    getFormReferenceStatusHandler,
    navigateToReferencedModelHandler,
} from "./bpmnMessageHandlers";

function createHandler() {
    const editorStore = { requireHandle: vi.fn() };
    const modelNavigationService = { navigate: vi.fn().mockResolvedValue(undefined) };
    const notifier = { logWarning: vi.fn() };

    const handler = navigateToReferencedModelHandler(
        editorStore as never,
        modelNavigationService as never,
        notifier as never,
    );
    return { handler, editorStore, modelNavigationService, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("navigateToReferencedModelHandler", () => {
    it("forwards a process-kind command to the service with the editor's document URI", async () => {
        const { handler, editorStore, modelNavigationService } = createHandler();
        editorStore.requireHandle.mockReturnValue({ documentFsPath: () => "/src/a.bpmn" });

        await handler(
            new NavigateToReferencedModelCommand("ProcessB", "process"),
            "file:///src/a.bpmn",
        );

        expect(editorStore.requireHandle).toHaveBeenCalledWith("file:///src/a.bpmn");
        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "ProcessB",
            "process",
            "/src/a.bpmn",
        );
    });

    it("forwards a decision-kind command unchanged", async () => {
        const { handler, editorStore, modelNavigationService } = createHandler();
        editorStore.requireHandle.mockReturnValue({ documentFsPath: () => "/src/a.bpmn" });

        await handler(
            new NavigateToReferencedModelCommand("Decision_1", "decision"),
            "file:///src/a.bpmn",
        );

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "Decision_1",
            "decision",
            "/src/a.bpmn",
        );
    });

    it("forwards a form-kind command unchanged", async () => {
        const { handler, editorStore, modelNavigationService } = createHandler();
        editorStore.requireHandle.mockReturnValue({ documentFsPath: () => "/src/a.bpmn" });

        await handler(
            new NavigateToReferencedModelCommand("Form_Request", "form"),
            "file:///src/a.bpmn",
        );

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "Form_Request",
            "form",
            "/src/a.bpmn",
        );
    });

    it("rejects unknown referenceKind values with a logWarning and no service call", async () => {
        const { handler, notifier, modelNavigationService } = createHandler();
        // Simulate protocol drift / a hostile webview sending an unexpected
        // discriminant by bypassing the command's compile-time type.
        const malformed = {
            type: "NavigateToReferencedModelCommand",
            referenceId: "X",
            referenceKind: "anything",
        };

        await handler(malformed as never, "file:///src/a.bpmn");

        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("unknown kind: anything"),
        );
        expect(modelNavigationService.navigate).not.toHaveBeenCalled();
    });
});

describe("getFormReferenceStatusHandler", () => {
    it("requests a status snapshot for the current editor", async () => {
        const statusService = { requestStatus: vi.fn().mockResolvedValue(undefined) };
        const handler = getFormReferenceStatusHandler(statusService as never);

        await handler(new GetFormReferenceStatusCommand(), "file:///src/a.bpmn");

        expect(statusService.requestStatus).toHaveBeenCalledWith("file:///src/a.bpmn");
    });
});
