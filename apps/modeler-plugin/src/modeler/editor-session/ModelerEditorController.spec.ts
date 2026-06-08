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

import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { EditorSessionContext, EditorSessionParticipant } from "./EditorSessionParticipant";
import { ModelerEditorController, ModelerEditorOptions } from "./ModelerEditorController";

const EDITOR_ID = "file:///diagram.bpmn";

/** Captures the callbacks the controller hands the store, so tests can fire them. */
function createFakeStore() {
    const captured: {
        message?: (message: unknown, id: string) => Promise<void> | void;
        dispose?: () => void;
    } = {};
    const store = {
        register: vi.fn(),
        subscribeToMessageEvent: vi.fn((_id: string, cb: typeof captured.message) => {
            captured.message = cb;
        }),
        subscribeToTabChangeEvent: vi.fn(),
        subscribeToDisposeEvent: vi.fn((_id: string, cb: () => void) => {
            captured.dispose = cb;
        }),
        subscribeToDocumentChangeEvent: vi.fn(),
        subscribeToSettingChangeEvent: vi.fn(),
        addToDisposals: vi.fn(),
    };
    return { store: store as unknown as EditorSessionStore, captured, raw: store };
}

function createNotifier() {
    return {
        logInfo: vi.fn(),
        logError: vi.fn(),
        showError: vi.fn(),
    } as unknown as VsCodeNotifier;
}

const document = { uri: { toString: () => EDITOR_ID } } as never;
const panel = { id: "panel" } as never;
const token = {} as never;

function resolve(options: Partial<ModelerEditorOptions>, notifier = createNotifier()) {
    const { store, captured, raw } = createFakeStore();
    const fullOptions: ModelerEditorOptions = {
        viewType: "bpmn-modeler.bpmn",
        messageRouter: new WebviewMessageRouter(),
        participants: [],
        ...options,
    };
    const controller = new ModelerEditorController(store, notifier, fullOptions);
    return { controller, store, captured, raw, notifier, options: fullOptions };
}

describe("ModelerEditorController.resolveCustomTextEditor", () => {
    beforeEach(() => {
        createSpy.mockReset();
        createSpy.mockImplementation((_viewType, editorId) => ({ id: editorId }));
    });

    it("short-circuits when delegateResolve handles the URI (diff branch)", async () => {
        const participant: EditorSessionParticipant = { onResolve: vi.fn() };
        const delegateResolve = vi.fn(() => true);
        const { controller, raw } = resolve({ participants: [participant], delegateResolve });

        await controller.resolveCustomTextEditor(document, panel, token);

        expect(delegateResolve).toHaveBeenCalledWith(document, panel);
        // No session is created and no participant runs once the diff branch claims it.
        expect(createSpy).not.toHaveBeenCalled();
        expect(raw.register).not.toHaveBeenCalled();
        expect(participant.onResolve).not.toHaveBeenCalled();
    });

    it("registers the session and runs each participant once with the editorId", async () => {
        const seen: string[] = [];
        const participantA: EditorSessionParticipant = {
            onResolve: vi.fn((ctx: EditorSessionContext) => void seen.push(ctx.editorId)),
        };
        const participantB: EditorSessionParticipant = {
            onResolve: vi.fn((ctx: EditorSessionContext) => void seen.push(ctx.editorId)),
        };
        const { controller, raw } = resolve({ participants: [participantA, participantB] });

        await controller.resolveCustomTextEditor(document, panel, token);

        expect(raw.register).toHaveBeenCalledTimes(1);
        expect(participantA.onResolve).toHaveBeenCalledTimes(1);
        expect(participantB.onResolve).toHaveBeenCalledTimes(1);
        expect(seen).toEqual([EDITOR_ID, EDITOR_ID]);
        expect(raw.subscribeToTabChangeEvent).toHaveBeenCalledWith(EDITOR_ID);
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
        const { controller, captured } = resolve({ messageRouter });

        await controller.resolveCustomTextEditor(document, panel, token);
        await captured.message?.({ type: "GetBpmnFileCommand" }, EDITOR_ID);

        expect(dispatch).toHaveBeenCalledWith({ type: "GetBpmnFileCommand" }, EDITOR_ID);
    });

    it("aggregates participant teardown into the single dispose subscription", async () => {
        const teardown = vi.fn();
        const participant: EditorSessionParticipant = {
            onResolve: (ctx) => ctx.onDispose(teardown),
        };
        const { controller, captured, raw } = resolve({ participants: [participant] });

        await controller.resolveCustomTextEditor(document, panel, token);
        expect(raw.subscribeToDisposeEvent).toHaveBeenCalledTimes(1);
        expect(teardown).not.toHaveBeenCalled();

        captured.dispose?.();
        expect(teardown).toHaveBeenCalledTimes(1);
    });

    it("catches resolve errors and surfaces them through the notifier", async () => {
        const notifier = createNotifier();
        const participant: EditorSessionParticipant = {
            onResolve: () => {
                throw new Error("boom");
            },
        };
        const { controller } = resolve({ participants: [participant] }, notifier);

        await expect(
            controller.resolveCustomTextEditor(document, panel, token),
        ).resolves.toBeUndefined();
        expect(notifier.showError).toHaveBeenCalledWith("boom");
        expect(notifier.logError).toHaveBeenCalled();
    });
});
