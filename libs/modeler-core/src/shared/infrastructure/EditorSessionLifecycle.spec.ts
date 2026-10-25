import { describe, expect, it, vi } from "vitest";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing";
import { EditorSessionContext, EditorSessionParticipant } from "../domain/EditorSessionParticipant";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

const PATH = "/work/diagram.bpmn";
const EDITOR_ID = `file://${PATH}`;

function command(type: string): Command {
    return { type } as Command;
}

function recordingParticipant(events: string[], name: string): EditorSessionParticipant {
    return {
        onResolve(session) {
            events.push(`${name} resolved ${session.editorId}`);
            session.onDispose(() => events.push(`${name} disposed`));
        },
    };
}

describe("EditorSessionLifecycle", () => {
    it("runs every participant once, in order, and tears each down once on close", async () => {
        const host = createTestHost();
        const events: string[] = [];

        const editor = await host.openSession(PATH, [
            recordingParticipant(events, "first"),
            recordingParticipant(events, "second"),
        ]);
        editor.dispose();
        editor.dispose();

        expect(events).toEqual([
            `first resolved ${EDITOR_ID}`,
            `second resolved ${EDITOR_ID}`,
            "first disposed",
            "second disposed",
        ]);
        expect(host.store.hasEditor(EDITOR_ID)).toBe(false);
    });

    it("keeps running later participants after one throws and surfaces the error", async () => {
        const host = createTestHost();
        const events: string[] = [];
        const failing: EditorSessionParticipant = {
            onResolve: () => {
                throw new Error("template root missing");
            },
        };

        const editor = await host.openSession(PATH, [
            failing,
            recordingParticipant(events, "next"),
        ]);
        editor.dispose();

        expect(host.notifier.errors).toEqual(["template root missing"]);
        expect(host.notifier.logged("error")).toEqual(["template root missing"]);
        expect(events).toEqual([`next resolved ${EDITOR_ID}`, "next disposed"]);
    });

    it("delivers focus, document and setting events of this session only while it is open", async () => {
        const host = createTestHost();
        const events: string[] = [];
        const participant: EditorSessionParticipant = {
            onResolve(session) {
                session.onFocusChange((focused) => events.push(`focus ${focused}`));
                session.onDocumentChange(() => events.push("document"));
                session.onSettingChange((event) =>
                    events.push(`setting ${event.affectsConfiguration("miragon.bpmnModeler")}`),
                );
            },
        };

        const editor = await host.openSession(PATH, [participant]);
        editor.loseFocus();
        editor.becomeActive();
        editor.changeDocument("<edited/>");
        editor.changeSetting("miragon.bpmnModeler.configFolder");
        editor.dispose();
        editor.changeDocument("<after-close/>");

        expect(events).toEqual(["focus false", "focus true", "document", "setting true"]);
    });

    it("makes a refocused editor the store's active editor", async () => {
        const host = createTestHost();
        const editor = await host.openSession(PATH, []);
        host.openEditor("/work/other.bpmn");

        editor.becomeActive();

        expect(host.store.getActiveEditorId()).toBe(EDITOR_ID);
    });

    it("re-runs the reseed callbacks of an open session and nothing after close", async () => {
        const host = createTestHost();
        let reseeds = 0;
        const participant: EditorSessionParticipant = {
            onResolve: (session) => session.onReseed(() => void reseeds++),
        };

        const editor = await host.openSession(PATH, [participant]);
        await host.reseedSession(editor.id);
        editor.dispose();
        await host.reseedSession(editor.id);

        expect(reseeds).toBe(1);
    });

    it("disposes resources a participant creates after its session was replaced", async () => {
        const host = createTestHost();
        let finishSetup: () => void = () => {};
        const setupPending = new Promise<void>((resolve) => {
            finishSetup = resolve;
        });
        const lateDisposable = { dispose: vi.fn() };
        const next: EditorSessionParticipant = { onResolve: vi.fn() };
        const slow: EditorSessionParticipant = {
            onResolve: vi.fn(async (session: EditorSessionContext) => {
                await setupPending;
                session.addDisposable(lateDisposable);
            }),
        };

        const opening = host.openSession(PATH, [slow, next]);
        await vi.waitFor(() => expect(slow.onResolve).toHaveBeenCalledOnce());
        host.openEditor(PATH);
        finishSetup();
        await opening;

        expect(lateDisposable.dispose).toHaveBeenCalledOnce();
        expect(next.onResolve).not.toHaveBeenCalled();
    });

    describe("webview messages", () => {
        it("dispatches them through the router with the session's editor id", async () => {
            const host = createTestHost();
            const router = new WebviewMessageRouter();
            const dispatch = vi.spyOn(router, "dispatch").mockResolvedValue();
            const editor = await host.openSession(PATH, [], { router });

            editor.receive(command("GetBpmnFileCommand"));

            await vi.waitFor(() =>
                expect(dispatch).toHaveBeenCalledWith({ type: "GetBpmnFileCommand" }, EDITOR_ID),
            );
        });

        it("queues a sync while dispatching a flush reply immediately", async () => {
            const host = createTestHost();
            const router = new WebviewMessageRouter();
            let finishSync: () => void = () => {};
            const pendingSync = new Promise<void>((resolve) => {
                finishSync = resolve;
            });
            const dispatched: string[] = [];
            vi.spyOn(router, "dispatch").mockImplementation(async (message) => {
                dispatched.push(message.type);
                if (message.type === "SyncDocumentCommand") await pendingSync;
            });
            const editor = await host.openSession(PATH, [], { router });

            editor.receive(new SyncDocumentCommand("<latest/>"));
            editor.receive(command("DocumentFlushedCommand"));
            await vi.waitFor(() =>
                expect(dispatched).toEqual(["SyncDocumentCommand", "DocumentFlushedCommand"]),
            );
            finishSync();
            await host.store.waitForEditorQueue(EDITOR_ID);

            // The editor still holds its old content, so the recorded sync reads as not yet applied.
            expect(host.store.isLatestDocumentSyncApplied(EDITOR_ID, editor)).toBe(false);
        });

        it("drops a sync based on an older host document revision", async () => {
            const host = createTestHost();
            const router = new WebviewMessageRouter();
            const dispatch = vi.spyOn(router, "dispatch").mockResolvedValue();
            const editor = await host.openSession(PATH, [], { router });

            editor.receive(new SyncDocumentCommand("<stale/>", 1));
            await host.store.waitForEditorQueue(EDITOR_ID);

            expect(dispatch).not.toHaveBeenCalled();
            expect(host.store.isLatestDocumentSyncApplied(EDITOR_ID, editor)).toBe(true);
        });

        it("does not record a sync when a host update arrives during dispatch", async () => {
            const host = createTestHost();
            const router = new WebviewMessageRouter();
            vi.spyOn(router, "dispatch").mockImplementation(async () => {
                host.store.markHostDocumentUpdated(EDITOR_ID);
            });
            const editor = await host.openSession(PATH, [], { router });

            host.store.markHostDocumentUpdated(EDITOR_ID);
            editor.receive(new SyncDocumentCommand("<stale/>", 1));
            await vi.waitFor(() => expect(router.dispatch).toHaveBeenCalledOnce());
            await host.store.waitForEditorQueue(EDITOR_ID);

            expect(host.store.isLatestDocumentSyncApplied(EDITOR_ID, editor)).toBe(true);
        });

        it("logs a rejected handler instead of leaving it unhandled", async () => {
            const host = createTestHost();
            const router = new WebviewMessageRouter();
            vi.spyOn(router, "dispatch").mockRejectedValue(new Error("handler boom"));
            const editor = await host.openSession(PATH, [], { router });

            editor.receive(command("SyncActivitiesCommand"));

            await vi.waitFor(() => expect(host.notifier.logged("error")).toEqual(["handler boom"]));
        });
    });
});
