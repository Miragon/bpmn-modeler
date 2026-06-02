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

    private readonly disposeListeners: Array<() => void> = [];
    private readonly messageListeners: Array<(message: Command) => void> = [];
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
        return "";
    }
    writeContent(): Promise<boolean> {
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
        this.disposed = true;
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
    onDidChangeDocument(_callback: (event: DocumentChangeEvent) => void): EditorSubscription {
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
    emitSettingChange(event: SettingChange): void {
        this.settingListeners.forEach((listener) => listener(event));
    }
}

const aCommand = { type: "command" } as unknown as Command;

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
