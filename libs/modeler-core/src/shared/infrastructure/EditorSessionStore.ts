import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    DocumentChangeEvent,
    EditorHandle,
    EditorSubscription,
    SettingChange,
} from "../domain/EditorSession";

/**
 * Pure, host-agnostic registry of open editor sessions plus active-editor
 * bookkeeping. Holds {@link EditorHandle}s (the port), never a `WebviewPanel`
 * or `TextDocument`, so services depend on it without pulling in `vscode`.
 *
 * Was the registry half of the former `EditorStore`; the VS Code half now lives
 * in {@link VsCodeEditorHandle}. The subscription methods are thin delegations
 * to the active or addressed handle — they keep their former call sites so
 * controllers barely change, but their signatures are now `vscode`-free.
 */
export class EditorSessionStore {
    /**
     * Keyed by the stringified document URI (`handle.documentUriString()`):
     * scheme must be part of the key because VS Code opens diff editors as two
     * independent `resolveCustomTextEditor` calls (a `git:` URI and a `file:`
     * URI sharing the same fs path). Keying by path alone would let the second
     * registration clobber the first.
     */
    private readonly editors: Map<string, EditorHandle> = new Map();

    /** Keeps ordering-sensitive work scoped to the editor session that caused it. */
    private readonly editorQueues: Map<EditorHandle, Promise<void>> = new Map();
    private readonly latestDocumentSync: Map<EditorHandle, string> = new Map();
    private readonly hostDocumentRevisions: Map<EditorHandle, number> = new Map();

    private activeEditorId: string | undefined;

    private readonly activeEditorListeners: Set<(id: string) => void> = new Set();

    /**
     * @param onOpenCountChanged Invoked with the open-editor count whenever it
     *   changes. The VS Code host wires this to the `setContext` key that
     *   keybinding/menu `when` clauses read — injected so this class names no
     *   `vscode` API.
     */
    constructor(private readonly onOpenCountChanged: (count: number) => void) {}

    /**
     * Registers an already-constructed session and makes it active. Replaces
     * the storage half of the former `createEditor`; webview bootstrap now
     * happens in {@link VsCodeEditorHandle.create}.
     */
    register(handle: EditorHandle): void {
        const replaced = this.editors.get(handle.id);
        if (replaced && replaced !== handle) {
            this.editorQueues.delete(replaced);
            this.latestDocumentSync.delete(replaced);
            this.hostDocumentRevisions.delete(replaced);
            // Retire the exact old session before the replacement's participants
            // register URI-keyed services and subscriptions.
            replaced.dispose();
        }
        this.editors.set(handle.id, handle);
        if (!this.hostDocumentRevisions.has(handle)) this.hostDocumentRevisions.set(handle, 0);
        this.setActiveEditor(handle.id);
        this.onOpenCountChanged(this.editors.size);
    }

    setActiveEditor(id: string): void {
        if (id === this.activeEditorId) {
            return;
        }
        this.activeEditorId = id;
        this.activeEditorListeners.forEach((listener) => listener(id));
    }

    /**
     * Used to re-push element templates to all open editors after a marketplace
     * refresh. Posting a BPMN-only query to a DMN webview is a harmless no-op.
     */
    getEditorIds(): string[] {
        return Array.from(this.editors.keys());
    }

    /** Whether an editor with this id is currently registered (not yet disposed). */
    hasEditor(editorId: string): boolean {
        return this.editors.has(editorId);
    }

    /** Captures the identity of the currently registered editor session. */
    captureEditorSession(editorId: string): object | undefined {
        return this.editors.get(editorId);
    }

    /** Guards async work against a close-and-reopen of the same document URI. */
    isCurrentEditorSession(editorId: string, session: object): boolean {
        return this.editors.get(editorId) === session;
    }

    /** Advances the causation revision for a genuine host-side document update. */
    markHostDocumentUpdated(editorId: string): number {
        const handle = this.requireHandle(editorId);
        const revision = (this.hostDocumentRevisions.get(handle) ?? 0) + 1;
        this.hostDocumentRevisions.set(handle, revision);
        return revision;
    }

    currentHostDocumentRevision(editorId: string): number {
        const handle = this.requireHandle(editorId);
        return this.hostDocumentRevisions.get(handle) ?? 0;
    }

    /** Seeds or advances a host-owned revision when a session is restored. */
    setHostDocumentRevision(editorId: string, revision: number): boolean {
        const handle = this.requireHandle(editorId);
        const current = this.hostDocumentRevisions.get(handle) ?? 0;
        if (revision < current) return false;
        this.hostDocumentRevisions.set(handle, revision);
        return true;
    }

    /** Rejects webview writes based on an older host snapshot. */
    isHostDocumentRevisionCurrent(editorId: string, revision?: number): boolean {
        const current = this.currentHostDocumentRevision(editorId);
        return revision === undefined ? current === 0 : revision === current;
    }

    /** Records the newest full-document sync attempted by one exact session. */
    recordDocumentSync(editorId: string, session: object, content: string): void {
        const handle = this.editors.get(editorId);
        if (handle !== session) return;
        if (sameDocumentContent(handle.getContent(), content)) {
            this.latestDocumentSync.delete(handle);
        } else {
            this.latestDocumentSync.set(handle, content);
        }
    }

    /** Whether the host document contains the latest normal sync from this session. */
    isLatestDocumentSyncApplied(editorId: string, session: object): boolean {
        const handle = this.editors.get(editorId);
        if (handle !== session) return false;
        const expected = this.latestDocumentSync.get(handle);
        return expected === undefined || sameDocumentContent(handle.getContent(), expected);
    }

    /** EOL-insensitive content verification scoped to an exact editor session. */
    documentMatches(editorId: string, session: object, content: string): boolean {
        const handle = this.editors.get(editorId);
        return handle === session && sameDocumentContent(handle.getContent(), content);
    }

    getActiveEditorId(): string {
        if (!this.activeEditorId) {
            throw new Error("No active editor.");
        }
        return this.activeEditorId;
    }

    onDidChangeActiveEditor(listener: (id: string) => void): EditorSubscription {
        this.activeEditorListeners.add(listener);
        return { dispose: () => this.activeEditorListeners.delete(listener) };
    }

    /**
     * Only `file:`-scheme editors are returned — callers expect a session they
     * can write to, never the readonly `git:` counterpart that may be open
     * alongside it in a diff view.
     */
    findEditorIdByPath(filePath: string): string | undefined {
        for (const handle of this.editors.values()) {
            if (handle.documentScheme() === "file" && handle.documentPath() === filePath) {
                return handle.id;
            }
        }
        return undefined;
    }

    addToDisposals(editorId: string, disposable: EditorSubscription): void {
        this.requireHandle(editorId).addSubscription(disposable);
    }

    /**
     * Wires session-teardown cleanup: store bookkeeping runs first, then the
     * caller's `onDispose`. Kept as a single dispose handler (rather than two
     * listeners) to preserve the former ordering and avoid disposing a handler
     * mid-emission.
     */
    subscribeToDisposeEvent(editorId: string, onDispose?: () => void): void {
        const handle = this.requireHandle(editorId);
        let handled = false;
        handle.onDidDispose(() => {
            if (handled) return;
            handled = true;
            if (!this.disposeEditor(editorId, handle)) handle.dispose();
            onDispose?.();
        });
    }

    /**
     * `editorId` is captured at subscription time so the callback always
     * receives the id of the editor that owns this webview — not whatever
     * editor happens to be active when the message arrives.
     */
    subscribeToMessageEvent(
        editorId: string,
        callback: (message: Command, editorId: string) => void | Promise<void>,
    ): void {
        const handle = this.requireHandle(editorId);
        handle.addSubscription(
            handle.onDidReceiveMessage((message) => {
                if (this.editors.get(editorId) !== handle) return;
                void callback(message, editorId);
            }),
        );
    }

    /**
     * Runs work after earlier tasks for this editor and keeps later tasks behind it.
     * The returned promise preserves the task result while the internal queue
     * absorbs failures so one rejected task cannot block every later message.
     */
    runInEditorQueue<T>(editorId: string, task: () => T | Promise<T>): Promise<T | undefined> {
        const handle = this.requireHandle(editorId);
        const previous = this.editorQueues.get(handle);
        const run = (): T | Promise<T> | undefined => {
            if (this.editors.get(editorId) !== handle) return undefined;
            return task();
        };
        let result: Promise<T | undefined>;
        if (previous) {
            result = previous.then(run);
        } else {
            try {
                result = Promise.resolve(run());
            } catch (error) {
                result = Promise.reject(error);
            }
        }

        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        this.editorQueues.set(handle, settled);
        void settled.then(() => {
            if (this.editorQueues.get(handle) === settled) {
                this.editorQueues.delete(handle);
            }
        });
        return result;
    }

    /** Waits for the work currently queued for this editor. */
    waitForEditorQueue(editorId: string): Promise<void> {
        const handle = this.editors.get(editorId);
        return (handle && this.editorQueues.get(handle)) ?? Promise.resolve();
    }

    /**
     * Returns a free-standing subscription (not added to any session's bag)
     * because SVG response handlers must outlive a single request/response
     * exchange without being tied to editor lifecycle.
     */
    subscribeToActiveEditorMessage(callback: (message: Command) => void): EditorSubscription {
        return this.requireHandle(this.getActiveEditorId()).onDidReceiveMessage(callback);
    }

    subscribeToDocumentChangeEvent(
        editorId: string,
        callback: (event: DocumentChangeEvent) => void,
    ): void {
        const handle = this.requireHandle(editorId);
        handle.addSubscription(
            handle.onDidChangeDocument((event) => {
                if (this.editors.get(editorId) === handle) callback(event);
            }),
        );
    }

    subscribeToSettingChangeEvent(
        editorId: string,
        callback: (event: SettingChange, editorId: string) => void,
    ): void {
        const handle = this.requireHandle(editorId);
        handle.addSubscription(
            handle.onDidChangeSetting((event) => {
                if (this.editors.get(editorId) === handle) callback(event, editorId);
            }),
        );
    }

    subscribeToTabChangeEvent(editorId: string): void {
        const handle = this.requireHandle(editorId);
        handle.onDidBecomeActive(() => {
            if (this.editors.get(editorId) === handle) this.setActiveEditor(editorId);
        });
    }

    /**
     * @throws If the editor is hidden without `retainContextWhenHidden`, or if
     *   the post fails — both surfaced by the underlying handle.
     */
    postMessage(editorId: string, message: Command | Query): Promise<boolean> {
        return this.requireHandle(editorId).postMessage(message);
    }

    /**
     * Restarts the addressed editor's webview so it re-requests document,
     * element templates, and settings — the workaround for hosts/setups where
     * the element-template file watcher never fires (WSL + symlinked workspace).
     *
     * @throws If the host's handle does not support in-place reload.
     */
    reload(editorId: string): void {
        const handle = this.requireHandle(editorId);
        if (!handle.reload) {
            throw new Error("This host does not support reloading the editor.");
        }
        handle.reload();
    }

    requireHandle(editorId: string): EditorHandle {
        const handle = this.editors.get(editorId);
        if (!handle) {
            throw new Error(`No editor found for id: ${editorId}`);
        }
        return handle;
    }

    /** Removes only the exact session supplied, leaving a same-id replacement intact. */
    unregister(editorId: string, session: object): boolean {
        const handle = this.editors.get(editorId);
        if (handle !== session) return false;
        return this.disposeEditor(editorId, handle);
    }

    dispose(): void {
        this.activeEditorListeners.clear();
        this.editorQueues.clear();
        this.latestDocumentSync.clear();
        this.hostDocumentRevisions.clear();
    }

    /**
     * After disposal, the active-editor pointer moves to the most recently
     * registered remaining editor, or clears if none remain.
     */
    private disposeEditor(editorId: string, expected?: EditorHandle): boolean {
        const handle = this.editors.get(editorId);
        if (!handle || (expected && handle !== expected)) return false;
        handle.dispose();
        this.editors.delete(editorId);
        this.editorQueues.delete(handle);
        this.latestDocumentSync.delete(handle);
        this.hostDocumentRevisions.delete(handle);

        this.onOpenCountChanged(this.editors.size);

        if (this.activeEditorId === editorId) {
            const remaining = [...this.editors.keys()];
            const next = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
            this.activeEditorId = next;
            if (next) {
                this.activeEditorListeners.forEach((listener) => listener(next));
            }
        }
        return true;
    }
}

function sameDocumentContent(actual: string, expected: string): boolean {
    return actual.replace(/\r\n?/g, "\n") === expected.replace(/\r\n?/g, "\n");
}
