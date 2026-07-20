import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAllScriptTasksQuery } from "@miragon/bpmn-modeler-shared";

// The controller imports `vscode` transitively via `VsCodeNotifier`; capture the
// command registration so a test can invoke the handler the way VS Code would.
const registerCommandMock = vi.fn();
vi.mock("vscode", () => ({
    commands: { registerCommand: (...args: unknown[]) => registerCommandMock(...args) },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import {
    OPEN_ALL_SCRIPT_TASKS_CMD,
    ScriptTaskCommandController,
} from "./ScriptTaskCommandController";

const EDITOR = "file:///work/diagram.bpmn";

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Registers the controller and returns the command handler VS Code would call,
 * so tests exercise the real registration wiring rather than a private method.
 */
function registerAndGetHandler(editorStore: unknown, notifier: unknown): () => Promise<void> {
    new ScriptTaskCommandController(editorStore as never, notifier as never).register({
        subscriptions: [],
    } as never);
    expect(registerCommandMock).toHaveBeenCalledWith(
        OPEN_ALL_SCRIPT_TASKS_CMD,
        expect.any(Function),
        expect.anything(),
    );
    // registerCommand receives (id, handler, thisArg); VS Code invokes the
    // handler with that thisArg, so bind it here to reproduce the real call.
    const [, handler, thisArg] = registerCommandMock.mock.calls[0];
    return (handler as () => Promise<void>).bind(thisArg);
}

describe("ScriptTaskCommandController", () => {
    it("posts an OpenAllScriptTasksQuery to the active editor", async () => {
        const editorStore = {
            getActiveEditorId: vi.fn().mockReturnValue(EDITOR),
            postMessage: vi.fn().mockResolvedValue(true),
        };
        const notifier = { logError: vi.fn(), showInfo: vi.fn() };

        await registerAndGetHandler(editorStore, notifier)();

        expect(editorStore.postMessage).toHaveBeenCalledTimes(1);
        const [id, message] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(message).toBeInstanceOf(OpenAllScriptTasksQuery);
        expect(notifier.logError).not.toHaveBeenCalled();
        expect(notifier.showInfo).not.toHaveBeenCalled();
    });

    it("logs and hints when there is no active editor, without rejecting", async () => {
        const editorStore = {
            getActiveEditorId: vi.fn().mockImplementation(() => {
                throw new Error("No active editor.");
            }),
            postMessage: vi.fn(),
        };
        const notifier = { logError: vi.fn(), showInfo: vi.fn() };

        await expect(registerAndGetHandler(editorStore, notifier)()).resolves.toBeUndefined();

        expect(editorStore.postMessage).not.toHaveBeenCalled();
        expect(notifier.logError).toHaveBeenCalledTimes(1);
        expect(notifier.showInfo).toHaveBeenCalledTimes(1);
    });

    it("logs and hints when the active editor is hidden, without rejecting", async () => {
        const editorStore = {
            getActiveEditorId: vi.fn().mockReturnValue(EDITOR),
            postMessage: vi.fn().mockRejectedValue(new Error("The active editor is hidden.")),
        };
        const notifier = { logError: vi.fn(), showInfo: vi.fn() };

        await expect(registerAndGetHandler(editorStore, notifier)()).resolves.toBeUndefined();

        expect(notifier.logError).toHaveBeenCalledTimes(1);
        expect(notifier.showInfo).toHaveBeenCalledTimes(1);
    });
});
