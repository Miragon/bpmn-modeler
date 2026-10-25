import { beforeEach, describe, expect, it, vi } from "vitest";

// The controller only touches `window.registerCustomEditorProvider`; stub it so
// `register()` is callable and assert nothing else from `vscode`.
vi.mock("vscode", () => ({
    window: { registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })) },
}));

// `VsCodeEditorHandle.create` bootstraps a real webview; replace it with a
// lightweight stub so the controller's session registration is observable
// without a live panel.
const { createSpy } = vi.hoisted(() => ({ createSpy: vi.fn() }));
vi.mock("../../shared/infrastructure/VsCodeEditorHandle", () => ({
    VsCodeEditorHandle: { create: createSpy },
}));

import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { createTestHost, FakeEditorHandle } from "@miragon/bpmn-modeler-core/testing";
import { EditorSessionContext, EditorSessionParticipant } from "@miragon/bpmn-modeler-core";
import { ModelerEditorController, ModelerEditorOptions } from "./ModelerEditorController";

const EDITOR_PATH = "/diagram.bpmn";
const EDITOR_ID = `file://${EDITOR_PATH}`;

const document = { uri: { toString: () => EDITOR_ID } } as never;
const panel = { id: "panel" } as never;
const token = {} as never;

function resolve(options: Partial<ModelerEditorOptions>) {
    const host = createTestHost();
    const editor = new FakeEditorHandle(EDITOR_PATH);
    createSpy.mockReturnValue(editor);
    const fullOptions: ModelerEditorOptions = {
        viewType: "bpmn-modeler.bpmn",
        messageRouter: new WebviewMessageRouter(),
        participants: [],
        ...options,
    };
    const controller = new ModelerEditorController(host.store, host.notifier, fullOptions);
    return { controller, host, editor };
}

describe("ModelerEditorController.resolveCustomTextEditor", () => {
    beforeEach(() => {
        createSpy.mockReset();
    });

    it("short-circuits when delegateResolve handles the URI (diff branch)", async () => {
        const participant: EditorSessionParticipant = { onResolve: vi.fn() };
        const delegateResolve = vi.fn(() => true);
        const { controller, host } = resolve({ participants: [participant], delegateResolve });

        await controller.resolveCustomTextEditor(document, panel, token);

        expect(delegateResolve).toHaveBeenCalledWith(document, panel);
        // No session is created and no participant runs once the diff branch claims it.
        expect(createSpy).not.toHaveBeenCalled();
        expect(host.store.getEditorIds()).toEqual([]);
        expect(participant.onResolve).not.toHaveBeenCalled();
    });

    it("registers the session and runs each participant once with the editorId", async () => {
        const seen: string[] = [];
        const participant: EditorSessionParticipant = {
            onResolve: (ctx: EditorSessionContext) => void seen.push(ctx.editorId),
        };
        const { controller, host, editor } = resolve({ participants: [participant, participant] });

        await controller.resolveCustomTextEditor(document, panel, token);

        expect(host.store.captureEditorSession(EDITOR_ID)).toBe(editor);
        expect(seen).toEqual([EDITOR_ID, EDITOR_ID]);
    });

    it("passes the persisted panel visibility into the handle factory", async () => {
        const { controller } = resolve({ initialPanelVisible: () => false });

        await controller.resolveCustomTextEditor(document, panel, token);

        expect(createSpy).toHaveBeenCalledWith(
            "bpmn-modeler.bpmn",
            EDITOR_ID,
            panel,
            document,
            false,
        );
    });

    it("dispatches webview messages through the router", async () => {
        const messageRouter = new WebviewMessageRouter();
        const dispatch = vi.spyOn(messageRouter, "dispatch").mockResolvedValue();
        const { controller, editor } = resolve({ messageRouter });

        await controller.resolveCustomTextEditor(document, panel, token);
        editor.receive({ type: "GetBpmnFileCommand" } as never);

        await vi.waitFor(() =>
            expect(dispatch).toHaveBeenCalledWith({ type: "GetBpmnFileCommand" }, EDITOR_ID),
        );
    });

    it("frames the session with open and close breadcrumbs in the log", async () => {
        const { controller, host, editor } = resolve({});

        await controller.resolveCustomTextEditor(document, panel, token);
        editor.dispose();

        expect(host.notifier.logged("info")).toEqual([
            "Editor opened: diagram.bpmn (bpmn-modeler.bpmn)",
            "Editor closed: diagram.bpmn (bpmn-modeler.bpmn)",
        ]);
    });

    it("surfaces a failing participant through the notifier without rejecting", async () => {
        const participant: EditorSessionParticipant = {
            onResolve: () => {
                throw new Error("boom");
            },
        };
        const { controller, host } = resolve({ participants: [participant] });

        await expect(
            controller.resolveCustomTextEditor(document, panel, token),
        ).resolves.toBeUndefined();
        expect(host.notifier.errors).toEqual(["boom"]);
        expect(host.notifier.logged("error")).toEqual(["boom"]);
    });
});
