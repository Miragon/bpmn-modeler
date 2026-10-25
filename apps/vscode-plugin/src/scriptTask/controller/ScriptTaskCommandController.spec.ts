import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAllScriptTasksQuery } from "@miragon/bpmn-modeler-shared";

// Capture the command registration so a test can invoke the handler the way VS Code would.
const registerCommandMock = vi.fn();
vi.mock("vscode", () => ({
    commands: { registerCommand: (...args: unknown[]) => registerCommandMock(...args) },
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import { EditorSessionStore, NotifierPort } from "@miragon/bpmn-modeler-core";
import { createTestHost } from "@miragon/bpmn-modeler-core/testing";

import {
    OPEN_ALL_SCRIPT_TASKS_CMD,
    ScriptTaskCommandController,
} from "./ScriptTaskCommandController";

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Registers the controller and returns the command handler VS Code would call,
 * so tests exercise the real registration wiring rather than a private method.
 */
function registerAndGetHandler(
    editorStore: EditorSessionStore,
    notifier: NotifierPort,
): () => Promise<void> {
    new ScriptTaskCommandController(editorStore, notifier).register({
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
        const host = createTestHost();
        const editor = host.openEditor("/work/diagram.bpmn");

        await registerAndGetHandler(host.store, host.notifier)();

        expect(editor.posted).toHaveLength(1);
        expect(editor.posted[0]).toBeInstanceOf(OpenAllScriptTasksQuery);
        expect(host.notifier.logged("error")).toEqual([]);
        expect(host.notifier.infos).toEqual([]);
    });

    it("logs and hints when there is no active editor, without rejecting", async () => {
        const host = createTestHost();

        await expect(registerAndGetHandler(host.store, host.notifier)()).resolves.toBeUndefined();

        expect(host.notifier.logged("error")).toEqual(["No active editor."]);
        expect(host.notifier.infos).toEqual([
            "Focus a BPMN diagram tab, then run the command again.",
        ]);
    });

    it("logs and hints when the active editor is hidden, without rejecting", async () => {
        const host = createTestHost();
        const editor = host.openEditor("/work/diagram.bpmn");
        editor.hidden = true;

        await expect(registerAndGetHandler(host.store, host.notifier)()).resolves.toBeUndefined();

        expect(editor.posted).toEqual([]);
        expect(host.notifier.logged("error")).toEqual(["The active editor is hidden."]);
        expect(host.notifier.infos).toEqual([
            "Focus a BPMN diagram tab, then run the command again.",
        ]);
    });
});
