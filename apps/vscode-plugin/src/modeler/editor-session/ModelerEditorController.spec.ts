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
    let currentSession: object | undefined;
    const captured: {
        message?: (message: unknown, id: string) => Promise<void> | void;
        dispose?: () => void;
    } = {};
    const store = {
        register: vi.fn((session: object) => {
            currentSession = session;
        }),
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
        captureEditorSession: vi.fn(() => currentSession),
        isCurrentEditorSession: vi.fn((_id: string, session: object) => currentSession === session),
        isHostDocumentRevisionCurrent: vi.fn(() => true),
        recordDocumentSync: vi.fn(),
        runInEditorQueue: vi.fn(async (_id: string, task: () => Promise<void>) => task()),
    };
    return {
        store: store as unknown as EditorSessionStore,
        captured,
        raw: store,
        replaceSession: (session: object) => {
            currentSession = session;
        },
    };
}

function createNotifier() {
    return {
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logError: vi.fn(),
        showError: vi.fn(),
    } as unknown as VsCodeNotifier;
}

const document = { uri: { toString: () => EDITOR_ID } } as never;
const panel = { id: "panel" } as never;
const token = {} as never;

function resolve(options: Partial<ModelerEditorOptions>, notifier = createNotifier()) {
    const { store, captured, raw, replaceSession } = createFakeStore();
    const fullOptions: ModelerEditorOptions = {
        viewType: "bpmn-modeler.bpmn",
        messageRouter: new WebviewMessageRouter(),
        participants: [],
        ...options,
    };
    const controller = new ModelerEditorController(store, notifier, fullOptions);
    return { controller, store, captured, raw, replaceSession, notifier, options: fullOptions };
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

    it("queues sync while dispatching a flush reply immediately", async () => {
        const messageRouter = new WebviewMessageRouter();
        let finishSync: () => void = () => {};
        const pendingSync = new Promise<void>((resolve) => {
            finishSync = resolve;
        });
        const dispatch = vi.spyOn(messageRouter, "dispatch").mockImplementation(async (message) => {
            if (message.type === "SyncDocumentCommand") await pendingSync;
        });
        const { controller, captured, raw } = resolve({ messageRouter });

        await controller.resolveCustomTextEditor(document, panel, token);
        await captured.message?.({ type: "GetFormReferenceStatusCommand" }, EDITOR_ID);
        expect(raw.runInEditorQueue).not.toHaveBeenCalled();

        const syncMessage = { type: "SyncDocumentCommand", content: "<latest/>" };
        const syncing = captured.message?.(syncMessage, EDITOR_ID);
        await vi.waitFor(() => expect(raw.runInEditorQueue).toHaveBeenCalledOnce());
        expect(dispatch).toHaveBeenCalledWith(syncMessage, EDITOR_ID);

        await captured.message?.({ type: "DocumentFlushedCommand" }, EDITOR_ID);

        expect(dispatch).toHaveBeenCalledWith({ type: "DocumentFlushedCommand" }, EDITOR_ID);
        expect(raw.runInEditorQueue).toHaveBeenCalledOnce();
        finishSync();
        await syncing;
        expect(raw.recordDocumentSync).toHaveBeenCalledWith(
            EDITOR_ID,
            expect.any(Object),
            "<latest/>",
        );
    });

    it("drops a sync based on an older host document revision", async () => {
        const messageRouter = new WebviewMessageRouter();
        const dispatch = vi.spyOn(messageRouter, "dispatch").mockResolvedValue();
        const { controller, captured, raw } = resolve({ messageRouter });
        raw.isHostDocumentRevisionCurrent.mockReturnValue(false);

        await controller.resolveCustomTextEditor(document, panel, token);
        await captured.message?.(
            { type: "SyncDocumentCommand", content: "<stale/>", documentRevision: 1 },
            EDITOR_ID,
        );

        expect(dispatch).not.toHaveBeenCalled();
        expect(raw.runInEditorQueue).not.toHaveBeenCalled();
        expect(raw.recordDocumentSync).not.toHaveBeenCalled();
    });

    it("does not record a sync when a host update arrives during dispatch", async () => {
        const messageRouter = new WebviewMessageRouter();
        vi.spyOn(messageRouter, "dispatch").mockResolvedValue();
        const { controller, captured, raw } = resolve({ messageRouter });
        raw.isHostDocumentRevisionCurrent.mockReturnValueOnce(true).mockReturnValueOnce(false);

        await controller.resolveCustomTextEditor(document, panel, token);
        await captured.message?.(
            { type: "SyncDocumentCommand", content: "<stale/>", documentRevision: 1 },
            EDITOR_ID,
        );

        expect(raw.runInEditorQueue).toHaveBeenCalledOnce();
        expect(raw.recordDocumentSync).not.toHaveBeenCalled();
    });

    it("logs a rejected dispatch instead of leaving it unhandled", async () => {
        const messageRouter = new WebviewMessageRouter();
        const error = new Error("handler boom");
        vi.spyOn(messageRouter, "dispatch").mockRejectedValue(error);
        const notifier = createNotifier();
        const { controller, captured } = resolve({ messageRouter }, notifier);

        await controller.resolveCustomTextEditor(document, panel, token);
        // VS Code does not await this async listener, so the callback itself must
        // resolve (the rejection is caught) and the error logged, not thrown.
        await expect(
            captured.message?.({ type: "SyncActivitiesCommand" }, EDITOR_ID),
        ).resolves.toBeUndefined();
        expect(notifier.logError).toHaveBeenCalledWith(error);
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

    it("disposes resources created after an async session was replaced", async () => {
        let finishSetup: () => void = () => {};
        const setupPending = new Promise<void>((resolve) => {
            finishSetup = resolve;
        });
        const lateDisposable = { dispose: vi.fn() };
        const nextParticipant: EditorSessionParticipant = { onResolve: vi.fn() };
        const participant: EditorSessionParticipant = {
            onResolve: vi.fn(async (session: EditorSessionContext) => {
                await setupPending;
                session.addDisposable(lateDisposable);
            }),
        };
        const { controller, replaceSession, raw } = resolve({
            participants: [participant, nextParticipant],
        });

        const resolving = controller.resolveCustomTextEditor(document, panel, token);
        await vi.waitFor(() => expect(participant.onResolve).toHaveBeenCalledOnce());
        replaceSession({ id: EDITOR_ID });
        finishSetup();
        await resolving;

        expect(lateDisposable.dispose).toHaveBeenCalledOnce();
        expect(raw.addToDisposals).not.toHaveBeenCalled();
        expect(nextParticipant.onResolve).not.toHaveBeenCalled();
    });
});
