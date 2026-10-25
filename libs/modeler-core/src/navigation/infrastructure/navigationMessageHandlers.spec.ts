import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    GetFormReferenceStatusCommand,
    NavigateToReferencedModelCommand,
} from "@miragon/bpmn-modeler-shared";
import { createTestHost } from "../../testing";

import {
    getFormReferenceStatusHandler,
    navigateToReferencedModelHandler,
} from "./navigationMessageHandlers";

function createHandler() {
    const host = createTestHost();
    const editor = host.openEditor("/src/a.bpmn");
    host.openEditor("/src/b.bpmn");
    const modelNavigationService = { navigate: vi.fn().mockResolvedValue(undefined) };

    const handler = navigateToReferencedModelHandler(
        host.store,
        modelNavigationService as never,
        host.notifier,
    );
    return { handler, editor, modelNavigationService, notifier: host.notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("navigateToReferencedModelHandler", () => {
    it("forwards a process-kind command to the service with the editor's document URI", async () => {
        const { handler, editor, modelNavigationService } = createHandler();

        await handler(new NavigateToReferencedModelCommand("ProcessB", "process"), editor.id);

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "ProcessB",
            "process",
            "/src/a.bpmn",
        );
    });

    it("forwards a decision-kind command unchanged", async () => {
        const { handler, editor, modelNavigationService } = createHandler();

        await handler(new NavigateToReferencedModelCommand("Decision_1", "decision"), editor.id);

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "Decision_1",
            "decision",
            "/src/a.bpmn",
        );
    });

    it("forwards a form-kind command unchanged", async () => {
        const { handler, editor, modelNavigationService } = createHandler();

        await handler(new NavigateToReferencedModelCommand("Form_Request", "form"), editor.id);

        expect(modelNavigationService.navigate).toHaveBeenCalledWith(
            "Form_Request",
            "form",
            "/src/a.bpmn",
        );
    });

    it("rejects unknown referenceKind values with a logWarning and no service call", async () => {
        const { handler, editor, notifier, modelNavigationService } = createHandler();
        // Simulate protocol drift / a hostile webview sending an unexpected
        // discriminant by bypassing the command's compile-time type.
        const malformed = {
            type: "NavigateToReferencedModelCommand",
            referenceId: "X",
            referenceKind: "anything",
        };

        await handler(malformed as never, editor.id);

        expect(notifier.logged("warning")).toEqual([
            "Ignoring NavigateToReferencedModelCommand with unknown kind: anything",
        ]);
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
