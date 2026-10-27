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

    it("register makes the first handle the command target and reports the open count", () => {
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

    // ─── focus ──────────────────────────────────────────────────────────────

    it("reports focus from the handle, not from the active-editor pointer", () => {
        const store = new EditorSessionStore(vi.fn());
        const target = new FakeEditorHandle("/repo/1.bpmn");
        target.active = true;
        store.register(target);
        store.register(new FakeEditorHandle("/repo/2.bpmn"));

        // A text editor takes focus; the diagram keeps the command target.
        target.loseFocus();

        expect(store.getActiveEditorId()).toBe(target.id);
        expect(store.isFocused(target.id)).toBe(false);
        expect(store.getFocusedEditorId()).toBeUndefined();
    });

    // ─── command target (the active-editor pointer) ──────────────────────────

    it("keeps the command target on the focused editor when another session registers in the background", () => {
        const store = new EditorSessionStore(vi.fn());
        const focused = new FakeEditorHandle("/repo/1.bpmn");
        focused.active = true;
        store.register(focused);

        store.register(new FakeEditorHandle("/repo/2.bpmn"));

        expect(store.getActiveEditorId()).toBe(focused.id);
    });

    it("keeps the command target on the diagram focused last when a session registers while a text editor has focus", () => {
        const store = new EditorSessionStore(vi.fn());
        const focusedLast = new FakeEditorHandle("/repo/1.bpmn");
        store.register(focusedLast);
        store.subscribeToTabChangeEvent(focusedLast.id);
        focusedLast.becomeActive();
        focusedLast.loseFocus();

        store.register(new FakeEditorHandle("/repo/2.bpmn"));

        expect(store.getActiveEditorId()).toBe(focusedLast.id);
    });

    it("does not announce a target change when a session registers in the background", () => {
        const store = new EditorSessionStore(vi.fn());
        const focused = new FakeEditorHandle("/repo/1.bpmn");
        focused.active = true;
        store.register(focused);
        const announced: string[] = [];
        store.onDidChangeActiveEditor((editorId) => {
            announced.push(editorId);
        });

        store.register(new FakeEditorHandle("/repo/2.bpmn"));

        expect(announced).toEqual([]);
    });

    it("hands the command target to a session that registers focused", () => {
        const store = new EditorSessionStore(vi.fn());
        store.register(new FakeEditorHandle("/repo/1.bpmn"));
        const focused = new FakeEditorHandle("/repo/2.bpmn");
        focused.active = true;

        store.register(focused);

        expect(store.getActiveEditorId()).toBe(focused.id);
    });

    it("keeps the command target on a document whose session is replaced in the background", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        original.active = true;
        store.register(original);
        store.subscribeToDisposeEvent(original.id);
        store.register(new FakeEditorHandle("/repo/other.bpmn"));

        store.register(new FakeEditorHandle(A_PATH));

        expect(store.getActiveEditorId()).toBe(A_ID);
    });

    it("does not announce another target while the target's session is replaced", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle(A_PATH);
        original.active = true;
        store.register(original);
        store.subscribeToDisposeEvent(original.id);
        store.register(new FakeEditorHandle("/repo/other.bpmn"));
        const announced: string[] = [];
        store.onDidChangeActiveEditor((editorId) => {
            announced.push(editorId);
        });

        store.register(new FakeEditorHandle(A_PATH));

        expect(announced).toEqual([]);
    });

    it("keeps the open count while a session is replaced", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const original = new FakeEditorHandle(A_PATH);
        store.register(original);
        store.subscribeToDisposeEvent(original.id);
        store.register(new FakeEditorHandle("/repo/other.bpmn"));

        store.register(new FakeEditorHandle(A_PATH));

        expect(onOpenCountChanged.mock.calls.map(([count]) => count)).toEqual([1, 2, 2]);
    });

    it("moves the command target to a background session once its panel becomes active", () => {
        const store = new EditorSessionStore(vi.fn());
        const focused = new FakeEditorHandle("/repo/1.bpmn");
        focused.active = true;
        store.register(focused);
        const background = new FakeEditorHandle("/repo/2.bpmn");
        store.register(background);
        store.subscribeToTabChangeEvent(background.id);

        focused.loseFocus();
        background.becomeActive();

        expect(store.getActiveEditorId()).toBe(background.id);
    });

    it("stops reporting focus once the editor blurs or closes", () => {
        const store = new EditorSessionStore(vi.fn());
        const blurred = new FakeEditorHandle("/repo/1.bpmn");
        const closed = new FakeEditorHandle("/repo/2.bpmn");
        [blurred, closed].forEach((handle) => {
            handle.active = true;
            store.register(handle);
        });

        blurred.loseFocus();
        store.unregister(closed.id, closed);

        expect(store.isFocused(blurred.id)).toBe(false);
        expect(store.isFocused(closed.id)).toBe(false);
        expect(store.isFocused("file:///repo/never-opened.bpmn")).toBe(false);
        expect(store.getFocusedEditorId()).toBeUndefined();
    });

    // ─── dispose (via the dispose-event path) ────────────────────────────────

    it("disposing the active editor hands the target back to the editor focused before it", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const focusedBefore = new FakeEditorHandle("/repo/1.bpmn");
        const background = new FakeEditorHandle("/repo/2.bpmn");
        const active = new FakeEditorHandle("/repo/3.bpmn");
        const activeDisposeListener = vi.spyOn(active, "onDidDispose");
        focusedBefore.active = true;
        active.active = true;
        [focusedBefore, background, active].forEach((handle) => {
            store.register(handle);
            store.subscribeToDisposeEvent(handle.id);
        });

        // Fires only the dispose event, so the store itself must dispose the handle.
        activeDisposeListener.mock.calls[0][0]();

        expect(active.disposed).toBe(true);
        expect(store.getActiveEditorId()).toBe(focusedBefore.id);
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
        active.active = true;
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
        laterActive.active = true;
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
        laterActive.active = true;
        store.register(laterActive);

        subscribed.changeSetting("miragon.bpmnModeler.language");

        expect(received).toHaveBeenCalledOnce();
        const [[event, editorId]] = received.mock.calls;
        expect(editorId).toBe(subscribed.id);
        expect(event.affectsConfiguration("miragon.bpmnModeler.language")).toBe(true);
    });
});
