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
        this.editors.set(handle.id, handle);
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
        handle.onDidDispose(() => {
            this.disposeEditor(editorId);
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
        callback: (message: Command, editorId: string) => void,
    ): void {
        const handle = this.requireHandle(editorId);
        handle.addSubscription(
            handle.onDidReceiveMessage((message) => callback(message, editorId)),
        );
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
        handle.addSubscription(handle.onDidChangeDocument(callback));
    }

    subscribeToSettingChangeEvent(
        editorId: string,
        callback: (event: SettingChange, editorId: string) => void,
    ): void {
        const handle = this.requireHandle(editorId);
        handle.addSubscription(handle.onDidChangeSetting((event) => callback(event, editorId)));
    }

    subscribeToTabChangeEvent(editorId: string): void {
        const handle = this.requireHandle(editorId);
        handle.onDidBecomeActive(() => this.setActiveEditor(editorId));
    }

    /**
     * @throws If the editor is hidden without `retainContextWhenHidden`, or if
     *   the post fails — both surfaced by the underlying handle.
     */
    postMessage(editorId: string, message: Command | Query): Promise<boolean> {
        return this.requireHandle(editorId).postMessage(message);
    }

    requireHandle(editorId: string): EditorHandle {
        const handle = this.editors.get(editorId);
        if (!handle) {
            throw new Error(`No editor found for id: ${editorId}`);
        }
        return handle;
    }

    dispose(): void {
        this.activeEditorListeners.clear();
    }

    /**
     * After disposal, the active-editor pointer moves to the most recently
     * registered remaining editor, or clears if none remain.
     */
    private disposeEditor(editorId: string): void {
        const handle = this.editors.get(editorId);
        if (!handle) {
            return;
        }
        handle.dispose();
        this.editors.delete(editorId);

        this.onOpenCountChanged(this.editors.size);

        if (this.activeEditorId === editorId) {
            const remaining = [...this.editors.keys()];
            const next = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
            this.activeEditorId = next;
            if (next) {
                this.activeEditorListeners.forEach((listener) => listener(next));
            }
        }
    }
}
