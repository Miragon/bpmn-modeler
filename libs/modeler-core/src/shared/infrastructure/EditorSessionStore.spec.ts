import { describe, expect, it, vi } from "vitest";

import type { Command } from "@miragon/bpmn-modeler-shared";
import type {
    DocumentChangeEvent,
    EditorHandle,
    EditorSubscription,
    SettingChange,
} from "../domain/EditorSession";
import { EditorSessionStore } from "./EditorSessionStore";

/**
 * In-memory {@link EditorHandle} for testing the pure registry without a
 * `vscode` mock. Exposes `emit*` helpers so a test can drive the lifecycle
 * events the store subscribes to (dispose, message, setting change), and
 * records `disposed` so we can assert the store tears the handle down.
 */
class FakeEditorHandle implements EditorHandle {
    disposed = false;
    content = "";
    readonly reload = vi.fn();

    private readonly disposeListeners: Array<() => void> = [];
    private readonly messageListeners: Array<(message: Command) => void> = [];
    private readonly documentListeners: Array<(event: DocumentChangeEvent) => void> = [];
    private readonly settingListeners: Array<(event: SettingChange) => void> = [];
    readonly subscriptions: EditorSubscription[] = [];

    constructor(
        readonly id: string,
        private readonly scheme: string,
        private readonly path: string,
    ) {}

    documentUriString(): string {
        return `${this.scheme}://${this.path}`;
    }
    documentPath(): string {
        return this.path;
    }
    documentFsPath(): string {
        return this.path;
    }
    documentScheme(): string {
        return this.scheme;
    }

    getContent(): string {
        return this.content;
    }
    writeContent(content: string): Promise<boolean> {
        this.content = content;
        return Promise.resolve(true);
    }
    save(): Promise<boolean> {
        return Promise.resolve(true);
    }
    postMessage(): Promise<boolean> {
        return Promise.resolve(true);
    }
    isActive(): boolean {
        return false;
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposeListeners.forEach((listener) => listener());
    }

    onDidReceiveMessage(callback: (message: Command) => void): EditorSubscription {
        this.messageListeners.push(callback);
        return { dispose: vi.fn() };
    }
    onDidDispose(callback: () => void): EditorSubscription {
        this.disposeListeners.push(callback);
        return { dispose: vi.fn() };
    }
    onDidBecomeActive(): EditorSubscription {
        return { dispose: vi.fn() };
    }
    onDidChangeDocument(callback: (event: DocumentChangeEvent) => void): EditorSubscription {
        this.documentListeners.push(callback);
        return { dispose: vi.fn() };
    }
    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription {
        this.settingListeners.push(callback);
        return { dispose: vi.fn() };
    }

    // ─── test drivers ────────────────────────────────────────────────────────
    emitDispose(): void {
        this.disposeListeners.forEach((listener) => listener());
    }
    emitMessage(message: Command): void {
        this.messageListeners.forEach((listener) => listener(message));
    }
    emitDocumentChange(event: DocumentChangeEvent): void {
        this.documentListeners.forEach((listener) => listener(event));
    }
    emitSettingChange(event: SettingChange): void {
        this.settingListeners.forEach((listener) => listener(event));
    }
}

const aCommand = { type: "command" } as unknown as Command;
const anotherCommand = { type: "another-command" } as unknown as Command;

describe("EditorSessionStore", () => {
    // ─── register ──────────────────────────────────────────────────────────

    it("register makes the handle active and reports the open count", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");

        store.register(handle);

        expect(store.getActiveEditorId()).toBe("a");
        expect(onOpenCountChanged).toHaveBeenLastCalledWith(1);
    });

    it("distinguishes a replacement registered with the same editor id", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(original);
        store.subscribeToDisposeEvent(original.id);
        const originalSession = store.captureEditorSession(original.id)!;

        original.emitDispose();
        const replacement = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(replacement);

        expect(store.isCurrentEditorSession("a", originalSession)).toBe(false);
        expect(store.isCurrentEditorSession("a", store.captureEditorSession("a")!)).toBe(true);
    });

    it("rejects a webview revision after a host document update", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(handle);

        expect(store.isHostDocumentRevisionCurrent(handle.id, 0)).toBe(true);

        expect(store.markHostDocumentUpdated(handle.id)).toBe(1);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(1);
        expect(store.isHostDocumentRevisionCurrent(handle.id, 0)).toBe(false);
        expect(store.isHostDocumentRevisionCurrent(handle.id, 1)).toBe(true);
    });

    it("restores a host-owned revision without allowing it to move backwards", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(handle);

        expect(store.setHostDocumentRevision(handle.id, 4)).toBe(true);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(4);
        expect(store.setHostDocumentRevision(handle.id, 3)).toBe(false);
        expect(store.currentHostDocumentRevision(handle.id)).toBe(4);
    });

    it("unregisters only the exact same-id session", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const replacement = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(original);
        store.register(replacement);

        expect(store.unregister("a", original)).toBe(false);
        expect(store.hasEditor("a")).toBe(true);
        expect(store.unregister("a", replacement)).toBe(true);
        expect(store.hasEditor("a")).toBe(false);
    });

    // ─── findEditorIdByPath ──────────────────────────────────────────────────

    it("findEditorIdByPath returns the file: handle, never the git: counterpart", () => {
        const store = new EditorSessionStore(vi.fn());
        const path = "/repo/diagram.bpmn";
        // The diff view registers both schemes for one fs path; the store must
        // hand back the writable file: session, not the readonly git: one.
        store.register(new FakeEditorHandle("git", "git", path));
        store.register(new FakeEditorHandle("file", "file", path));

        expect(store.findEditorIdByPath(path)).toBe("file");
    });

    it("findEditorIdByPath returns undefined when only a git: handle exists", () => {
        const store = new EditorSessionStore(vi.fn());
        store.register(new FakeEditorHandle("git", "git", "/repo/diagram.bpmn"));

        expect(store.findEditorIdByPath("/repo/diagram.bpmn")).toBeUndefined();
    });

    // ─── dispose (via the dispose-event path) ────────────────────────────────

    it("disposing the active editor reassigns to the most recently registered remaining one", () => {
        const onOpenCountChanged = vi.fn();
        const store = new EditorSessionStore(onOpenCountChanged);
        const first = new FakeEditorHandle("first", "file", "/repo/1.bpmn");
        const second = new FakeEditorHandle("second", "file", "/repo/2.bpmn");
        const third = new FakeEditorHandle("third", "file", "/repo/3.bpmn");
        [first, second, third].forEach((handle) => {
            store.register(handle);
            store.subscribeToDisposeEvent(handle.id);
        });

        third.emitDispose();

        expect(third.disposed).toBe(true);
        expect(store.getActiveEditorId()).toBe("second");
        expect(onOpenCountChanged).toHaveBeenLastCalledWith(2);
    });

    it("disposing the last editor clears the active pointer", () => {
        const store = new EditorSessionStore(vi.fn());
        const only = new FakeEditorHandle("only", "file", "/repo/1.bpmn");
        store.register(only);
        store.subscribeToDisposeEvent(only.id);

        only.emitDispose();

        expect(() => store.getActiveEditorId()).toThrow("No active editor.");
    });

    it("disposing a non-active editor leaves the active pointer untouched", () => {
        const store = new EditorSessionStore(vi.fn());
        const background = new FakeEditorHandle("background", "file", "/repo/1.bpmn");
        const active = new FakeEditorHandle("active", "file", "/repo/2.bpmn");
        store.register(background);
        store.register(active);
        store.subscribeToDisposeEvent(background.id);

        background.emitDispose();

        expect(store.getActiveEditorId()).toBe("active");
    });

    it("runs the caller's onDispose after store bookkeeping", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const onDispose = vi.fn();
        store.register(handle);
        store.subscribeToDisposeEvent(handle.id, onDispose);

        handle.emitDispose();

        expect(onDispose).toHaveBeenCalledOnce();
    });

    it("retires an old handle before registering a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const replacement = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const onDispose = vi.fn();
        store.register(original);
        store.subscribeToDisposeEvent(original.id, onDispose);
        store.register(replacement);

        expect(store.captureEditorSession("a")).toBe(replacement);
        expect(original.disposed).toBe(true);
        expect(replacement.disposed).toBe(false);
        expect(onDispose).toHaveBeenCalledOnce();

        original.emitDispose();
        expect(onDispose).toHaveBeenCalledOnce();
    });

    // ─── subscription wiring captures editorId at subscription time ──────────

    it("subscribeToMessageEvent reports the subscribed editorId, not the active one", () => {
        const store = new EditorSessionStore(vi.fn());
        const subscribed = new FakeEditorHandle("subscribed", "file", "/repo/1.bpmn");
        const laterActive = new FakeEditorHandle("later", "file", "/repo/2.bpmn");
        store.register(subscribed);
        const received = vi.fn();
        store.subscribeToMessageEvent(subscribed.id, received);
        // A second editor becomes active after the subscription is wired.
        store.register(laterActive);

        subscribed.emitMessage(aCommand);

        expect(received).toHaveBeenCalledWith(aCommand, "subscribed");
    });

    it("ignores messages from an old handle after a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const replacement = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const received = vi.fn();
        store.register(original);
        store.subscribeToMessageEvent(original.id, received);
        store.register(replacement);

        original.emitMessage(aCommand);

        expect(received).not.toHaveBeenCalled();
    });

    it("ignores document changes from an old handle after a same-id replacement", () => {
        const store = new EditorSessionStore(vi.fn());
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const replacement = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        const received = vi.fn();
        store.register(original);
        store.subscribeToDocumentChangeEvent(original.id, received);
        store.register(replacement);

        original.emitDocumentChange({} as DocumentChangeEvent);

        expect(received).not.toHaveBeenCalled();
    });

    it("tracks whether the latest normal sync reached the session document", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        handle.content = "first\r\nline";
        store.register(handle);
        const session = store.captureEditorSession(handle.id)!;

        store.recordDocumentSync(handle.id, session, "first\nline");
        expect(store.isLatestDocumentSyncApplied(handle.id, session)).toBe(true);

        store.recordDocumentSync(handle.id, session, "different");
        expect(store.isLatestDocumentSyncApplied(handle.id, session)).toBe(false);
    });

    it("does not serialize unrelated webview messages", async () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
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

        handle.emitMessage(aCommand);
        handle.emitMessage(anotherCommand);

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
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
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
        const original = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
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
        original.emitDispose();
        store.register(new FakeEditorHandle("a", "file", "/repo/a.bpmn"));

        await store.runInEditorQueue("a", replacementWork);
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
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        store.register(handle);

        store.reload("a");

        expect(handle.reload).toHaveBeenCalledOnce();
    });

    it("reload throws when the host's handle does not support it", () => {
        const store = new EditorSessionStore(vi.fn());
        const handle = new FakeEditorHandle("a", "file", "/repo/a.bpmn");
        // A bridge/IntelliJ handle omits reload; the store must fail loudly
        // rather than silently no-op.
        (handle as { reload?: unknown }).reload = undefined;
        store.register(handle);

        expect(() => store.reload("a")).toThrow("does not support reloading");
    });

    it("subscribeToSettingChangeEvent reports the subscribed editorId, not the active one", () => {
        const store = new EditorSessionStore(vi.fn());
        const subscribed = new FakeEditorHandle("subscribed", "file", "/repo/1.bpmn");
        const laterActive = new FakeEditorHandle("later", "file", "/repo/2.bpmn");
        store.register(subscribed);
        const received = vi.fn();
        store.subscribeToSettingChangeEvent(subscribed.id, received);
        store.register(laterActive);

        const event: SettingChange = { affectsConfiguration: () => true };
        subscribed.emitSettingChange(event);

        expect(received).toHaveBeenCalledWith(event, "subscribed");
    });
});
