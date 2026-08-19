import { beforeEach, describe, expect, it, vi } from "vitest";

const executeCommandMock = vi.fn();

vi.mock("vscode", () => ({
    commands: {
        registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
        executeCommand: (...args: unknown[]) => executeCommandMock(...args),
    },
    Uri: { parse: (value: string) => ({ value, toString: () => value }) },
}));

import { BPMN_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { FocusElementQuery } from "@miragon/bpmn-modeler-shared";

import { FocusLintElementController } from "./FocusLintElementController";

function setup() {
    const postMessage = vi.fn().mockResolvedValue(true);
    const logError = vi.fn();
    const controller = new FocusLintElementController({ postMessage } as any, { logError } as any);
    return { controller, postMessage, logError };
}

beforeEach(() => {
    executeCommandMock.mockReset();
    executeCommandMock.mockResolvedValue(undefined);
});

describe("FocusLintElementController", () => {
    it("activates the editor then posts a focus query for the element", async () => {
        const { controller, postMessage } = setup();

        await (controller as any).focus("file:///a.bpmn", "Task_1");

        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ value: "file:///a.bpmn" }),
            BPMN_VIEW_TYPE,
        );
        expect(postMessage).toHaveBeenCalledWith("file:///a.bpmn", expect.any(FocusElementQuery));
        expect(postMessage.mock.calls[0][1].elementId).toBe("Task_1");
    });

    it("logs instead of throwing when activation fails", async () => {
        const { controller, postMessage, logError } = setup();
        executeCommandMock.mockRejectedValue(new Error("no editor"));

        await (controller as any).focus("file:///a.bpmn", "Task_1");

        expect(postMessage).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledOnce();
    });
});
