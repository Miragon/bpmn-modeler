import { describe, expect, it, vi } from "vitest";

import type { Command } from "@miragon/bpmn-modeler-shared";

import { FakeEditorHandle } from "../../testing";
import type { DocumentChangeEvent, SettingChange } from "../domain/EditorSession";
import { EditorSessionStore } from "./EditorSessionStore";

const A_PATH = "/repo/a.bpmn";
const A_ID = "file:///repo/a.bpmn";

const aCommand = { type: "command" } as unknown as Command;
const anotherCommand = { type: "another-command" } as unknown as Command;

describe("EditorSessionStore", () => {
    // ─── register ──────────────────────────────────────────────────────────

    it("register makes the handle active and reports the open count", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const handle = new FakeEditorHandle(A_PATH);

        store.register(handle);

        expect(store.getActiveEditorId()).toBe(A_ID);
        expect(onOpenCountChanged).toHaveBeenLastCalledWith(1);
    });

    it("distinguishes a replacement registered with the same editor id", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        store.register(original);
        store.subscribeToDisposeEvent(original.id);
        const originalSession = store.captureEditorSession(original.id)!;

        original.dispose();
        const replacement = new FakeEditorHandle(A_PATH);
        store.register(replacement);

        expect(store.isCurrentEditorSession(A_ID, originalSession)).toBe(false);
        expect(store.isCurrentEditorSession(A_ID, store.captureEditorSession(A_ID)!)).toBe(true);
    });

    it("rejects a webview revision after a host document update", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        store.register(handle);

        expect(store.isHostDocumentRevisionCurrent(handle.id, 0)).toBe(true);

        expect(store.markHostDocumentUpdated(handle.id)).toBe(1);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(1);
        expect(store.isHostDocumentRevisionCurrent(handle.id, 0)).toBe(false);
        expect(store.isHostDocumentRevisionCurrent(handle.id, 1)).toBe(true);
    });

    it("restores a host-owned revision without allowing it to move backwards", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        store.register(handle);

        expect(store.setHostDocumentRevision(handle.id, 4)).toBe(true);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(4);
        expect(store.setHostDocumentRevision(handle.id, 3)).toBe(false);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(4);
    });

    it("unregisters only the exact same-id session", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        const replacement = new FakeEditorHandle(A_PATH);
        store.register(original);
        store.register(replacement);

        expect(store.unregister(A_ID, original)).toBe(false);
        expect(store.hasEditor(A_ID)).toBe(true);
        expect(store.unregister(A_ID, replacement)).toBe(true);
        expect(store.hasEditor(A_ID)).toBe(false);
    });

    // ─── findEditorIdByPath ──────────────────────────────────────────────────

    it("findEditorIdByPath returns the file: handle, never the git: counterpart", () => {
        const store = new EditorSessionStore(vi.fn());
        const path = "/repo/diagram.bpmn";
        const file = new FakeEditorHandle(path);
        // The diff view registers both schemes for one fs path; the store must
        // hand back the writable file: session, not the readonly git: one.
        store.register(new FakeEditorHandle(path, { scheme: "git" }));
        store.register(file);

        expect(store.findEditorIdByPath(path)).toBe(file.id);
    });

    it("findEditorIdByPath returns undefined when only a git: handle exists", () => {
        const store = new EditorSessionStore(vi.fn());
        store.register(new FakeEditorHandle("/repo/diagram.bpmn", { scheme: "git" }));

        expect(store.findEditorIdByPath("/repo/diagram.bpmn")).toBeUndefined();
    });

    // ─── dispose (via the dispose-event path) ────────────────────────────────

    it("disposing the active editor reassigns to the most recently registered remaining one", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const first = new FakeEditorHandle("/repo/1.bpmn");
        const second = new FakeEditorHandle("/repo/2.bpmn");
        const third = new FakeEditorHandle("/repo/3.bpmn");
        const thirdDisposeListener = vi.spyOn(third, "onDidDispose");
        [first, second, third].forEach((handle) => {
            store.register(handle);
            store.subscribeToDisposeEvent(handle.id);
        });

        // Fires only the dispose event, so the store itself must dispose the handle.
        thirdDisposeListener.mock.calls[0][0]();

        expect(third.disposed).toBe(true);
        expect(store.getActiveEditorId()).toBe(second.id);
        expect(onOpenCountChanged).toHaveBeenLastCalledWith(2);
    });

    it("disposing the last editor clears the active pointer", () => {
        const store = new EditorSessionStore(vi.fn());
        const only = new FakeEditorHandle("/repo/1.bpmn");
        store.register(only);
        store.subscribeToDisposeEvent(only.id);

        only.dispose();

        expect(() => store.getActiveEditorId()).toThrow("No active editor.");
    });

    it("disposing a non-active editor leaves the active pointer untouched", () => {
        const store = new EditorSessionStore(vi.fn());
        const background = new FakeEditorHandle("/repo/1.bpmn");
        const active = new FakeEditorHandle("/repo/2.bpmn");
        store.register(background);
        store.register(active);
        store.subscribeToDisposeEvent(background.id);

        background.dispose();

        expect(store.getActiveEditorId()).toBe(active.id);
    });

    it("runs the caller's onDispose after store bookkeeping", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        const onDispose = vi.fn();
        store.register(handle);
        store.subscribeToDisposeEvent(handle.id, onDispose);

        handle.dispose();

        expect(onDispose).toHaveBeenCalledOnce();
    });

    it("retires an old handle before registering a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        const replacement = new FakeEditorHandle(A_PATH);
        const originalDisposeListener = vi.spyOn(original, "onDidDispose");
        const onDispose = vi.fn();
        store.register(original);
        store.subscribeToDisposeEvent(original.id, onDispose);
        store.register(replacement);

        expect(store.captureEditorSession(A_ID)).toBe(replacement);
        expect(original.disposed).toBe(true);
        expect(replacement.disposed).toBe(false);
        expect(onDispose).toHaveBeenCalledOnce();

        // A late dispose event from the retired handle must not run onDispose again.
        originalDisposeListener.mock.calls[0][0]();
        expect(onDispose).toHaveBeenCalledOnce();
    });

    // ─── subscription wiring captures editorId at subscription time ──────────

    it("subscribeToMessageEvent reports the subscribed editorId, not the active one", () => {
        const store = new EditorSessionStore(vi.fn());
        const subscribed = new FakeEditorHandle("/repo/1.bpmn");
        const laterActive = new FakeEditorHandle("/repo/2.bpmn");
        store.register(subscribed);
        const received = vi.fn();
        store.subscribeToMessageEvent(subscribed.id, received);
        // A second editor becomes active after the subscription is wired.
        store.register(laterActive);

        subscribed.receive(aCommand);

        expect(received).toHaveBeenCalledWith(aCommand, subscribed.id);
    });

    it("ignores messages from an old handle after a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        const replacement = new FakeEditorHandle(A_PATH);
        const originalMessageListener = vi.spyOn(original, "onDidReceiveMessage");
        const received = vi.fn();
        store.register(original);
        store.subscribeToMessageEvent(original.id, received);
        store.register(replacement);

        // Retiring detaches the listener, so play a message the host still delivers to it.
        originalMessageListener.mock.calls[0][0](aCommand);

        expect(received).not.toHaveBeenCalled();
    });

    it("ignores document changes from an old handle after a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        const replacement = new FakeEditorHandle(A_PATH);
        const originalDocumentListener = vi.spyOn(original, "onDidChangeDocument");
        const received = vi.fn();
        store.register(original);
        store.subscribeToDocumentChangeEvent(original.id, received);
        store.register(replacement);

        // Retiring detaches the listener, so play a change the host still delivers to it.
        originalDocumentListener.mock.calls[0][0]({} as DocumentChangeEvent);

        expect(received).not.toHaveBeenCalled();
    });

    it("tracks whether the latest normal sync reached the session document", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH, { content: "first\r\nline" });
        store.register(handle);
        const session = store.captureEditorSession(handle.id)!;

        store.recordDocumentSync(handle.id, session, "first\nline");
        expect(store.isLatestDocumentSyncApplied(handle.id, session)).toBe(true);

        store.recordDocumentSync(handle.id, session, "different");
        expect(store.isLatestDocumentSyncApplied(handle.id, session)).toBe(false);
    });

    it("does not serialize unrelated webview messages", async () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        let finishFirst: () => void = () => {};
        const firstPending = new Promise<void>((resolve) => {
            finishFirst = resolve;
        });
        const processed: string[] = [];
        store.register(handle);
        store.subscribeToMessageEvent(handle.id, async (message) => {
            processed.push(`${message.type}:start`);
            if (message === aCommand) {
                await firstPending;
            }
            processed.push(`${message.type}:end`);
        });

        handle.receive(aCommand);
        handle.receive(anotherCommand);

        expect(processed).toEqual([
            "command:start",
            "another-command:start",
            "another-command:end",
        ]);
        finishFirst();
        await vi.waitFor(() => expect(processed).toContain("command:end"));

        expect(processed).toEqual([
            "command:start",
            "another-command:start",
            "another-command:end",
            "command:end",
        ]);
    });

    it("queues host work behind earlier ordering-sensitive work", async () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        let finishMessage: () => void = () => {};
        const messagePending = new Promise<void>((resolve) => {
            finishMessage = resolve;
        });
        const processed: string[] = [];
        store.register(handle);
        const messageWork = store.runInEditorQueue(handle.id, async () => {
            processed.push("message:start");
            await messagePending;
            processed.push("message:end");
        });

        const hostWork = store.runInEditorQueue(handle.id, () => {
            processed.push("host");
        });

        expect(processed).toEqual(["message:start"]);
        finishMessage();
        await messageWork;
        await hostWork;

        expect(processed).toEqual(["message:start", "message:end", "host"]);
    });

    it("drops queued work from a disposed session without blocking its replacement", async () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        let finishOriginal: () => void = () => {};
        const originalPending = new Promise<void>((resolve) => {
            finishOriginal = resolve;
        });
        const staleWork = vi.fn();
        const replacementWork = vi.fn();
        store.register(original);
        store.subscribeToDisposeEvent(original.id);

        const running = store.runInEditorQueue(original.id, () => originalPending);
        const stale = store.runInEditorQueue(original.id, staleWork);
        original.dispose();
        store.register(new FakeEditorHandle(A_PATH));

        await store.runInEditorQueue(A_ID, replacementWork);
        expect(replacementWork).toHaveBeenCalledOnce();
        expect(staleWork).not.toHaveBeenCalled();

        finishOriginal();
        await running;
        await stale;
        expect(staleWork).not.toHaveBeenCalled();
    });

    // ─── reload ──────────────────────────────────────────────────────────────

    it("reload delegates to the addressed handle", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        store.register(handle);

        store.reload(A_ID);

        expect(handle.reloadCount).toBe(1);
    });

    it("reload throws when the host's handle does not support it", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle(A_PATH);
        // A bridge/IntelliJ handle omits reload; the store must fail loudly
        // rather than silently no-op.
        (handle as { reload?: unknown }).reload = undefined;
        store.register(handle);

        expect(() => store.reload(A_ID)).toThrow("does not support reloading");
    });

    it("subscribeToSettingChangeEvent reports the subscribed editorId, not the active one", () => {
        const store = new EditorSessionStore(vi.fn());
        const subscribed = new FakeEditorHandle("/repo/1.bpmn");
        const laterActive = new FakeEditorHandle("/repo/2.bpmn");
        store.register(subscribed);
        const received = vi.fn<(event: SettingChange, editorId: string) => void>();
        store.subscribeToSettingChangeEvent(subscribed.id, received);
        store.register(laterActive);

        subscribed.changeSetting("miragon.bpmnModeler.language");

        expect(received).toHaveBeenCalledOnce();
        const [[event, editorId]] = received.mock.calls;
        expect(editorId).toBe(subscribed.id);
        expect(event.affectsConfiguration("miragon.bpmnModeler.language")).toBe(true);
    });
});
