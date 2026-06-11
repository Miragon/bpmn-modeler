import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import { NavigateToImplementationCommand } from "@miragon/bpmn-modeler-shared";

import { navigateToImplementationHandler } from "./bpmnMessageHandlers";

function createHandler() {
    const editorStore = { requireHandle: vi.fn() };
    const implementationNavigationService = { navigate: vi.fn().mockResolvedValue(undefined) };
    const notifier = { logWarning: vi.fn() };

    const handler = navigateToImplementationHandler(
        editorStore as never,
        implementationNavigationService as never,
        notifier as never,
    );
    return { handler, editorStore, implementationNavigationService, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("navigateToImplementationHandler", () => {
    it("forwards a javaClass command to the service with the editor's document path", async () => {
        const { handler, editorStore, implementationNavigationService } = createHandler();
        editorStore.requireHandle.mockReturnValue({ documentFsPath: () => "/src/a.bpmn" });

        await handler(
            new NavigateToImplementationCommand("com.example.MyDelegate", "javaClass"),
            "file:///src/a.bpmn",
        );

        expect(editorStore.requireHandle).toHaveBeenCalledWith("file:///src/a.bpmn");
        expect(implementationNavigationService.navigate).toHaveBeenCalledWith(
            "com.example.MyDelegate",
            "javaClass",
            "/src/a.bpmn",
        );
    });

    it("forwards a jobType command unchanged", async () => {
        const { handler, editorStore, implementationNavigationService } = createHandler();
        editorStore.requireHandle.mockReturnValue({ documentFsPath: () => "/src/a.bpmn" });

        await handler(
            new NavigateToImplementationCommand("payment-service", "jobType"),
            "file:///src/a.bpmn",
        );

        expect(implementationNavigationService.navigate).toHaveBeenCalledWith(
            "payment-service",
            "jobType",
            "/src/a.bpmn",
        );
    });

    it("rejects unknown kind values with a logWarning and no service call", async () => {
        const { handler, notifier, implementationNavigationService } = createHandler();
        // Simulate protocol drift / a hostile webview sending an unexpected
        // discriminant by bypassing the command's compile-time type.
        const malformed = {
            type: "NavigateToImplementationCommand",
            reference: "X",
            kind: "anything",
        };

        await handler(malformed as never, "file:///src/a.bpmn");

        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("unknown kind: anything"),
        );
        expect(implementationNavigationService.navigate).not.toHaveBeenCalled();
    });
});
