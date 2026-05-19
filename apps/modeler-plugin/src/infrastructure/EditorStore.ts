import {
    commands,
    ConfigurationChangeEvent,
    Disposable,
    Event,
    EventEmitter,
    TextDocument,
    TextDocumentChangeEvent,
    WebviewPanel,
    workspace,
} from "vscode";

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import { bootstrapWebview } from "./bootstrapWebview";

const OPEN_EDITORS_COUNTER_KEY = "bpmn-modeler.openCustomEditors";

type EditorEntry = {
    id: string;
    ui: WebviewPanel;
    document: TextDocument;
};

export class EditorStore implements Disposable {
    /**
     * Keyed by the stringified document URI (`document.uri.toString()`):
     * scheme must be part of the key because VS Code opens diff editors as
     * two independent `resolveCustomTextEditor` calls (a `git:` URI and a
     * `file:` URI sharing the same fs path). Keying by path alone would
     * cause the second registration to clobber the first.
     */
    private readonly editors: Map<string, EditorEntry> = new Map();

    private readonly disposables: Map<string, Disposable[]> = new Map();

    private activeEditorId: string | undefined;

    private readonly _onDidChangeActiveEditor = new EventEmitter<string>();

    readonly onDidChangeActiveEditor: Event<string> = this._onDidChangeActiveEditor.event;

    /**
     * @param initialPanelVisible BPMN-only: pre-applied on the webview HTML
     *   so the panel never flashes visible before the webview JS picks up
     *   the persisted state. Ignored for DMN editors.
     */
    createEditor(
        viewType: string,
        editorId: string,
        webviewPanel: WebviewPanel,
        document: TextDocument,
        initialPanelVisible: boolean = true,
    ): WebviewPanel {
        const panel = bootstrapWebview(viewType, webviewPanel, initialPanelVisible);
        this.editors.set(editorId, { id: editorId, ui: panel, document });
        this.disposables.set(editorId, []);
        this.setActiveEditor(editorId);
        this.updateOpenEditorCounter(this.editors.size);
        return panel;
    }

    setActiveEditor(id: string): void {
        if (id === this.activeEditorId) {
            return;
        }
        this.activeEditorId = id;
        this._onDidChangeActiveEditor.fire(id);
    }

    getActiveEditorId(): string {
        if (!this.activeEditorId) {
            throw new Error("No active editor.");
        }
        return this.activeEditorId;
    }

    getDocumentForEditor(editorId: string): TextDocument {
        return this.getEditorById(editorId).document;
    }

    /**
     * Only `file:`-scheme editors are returned — callers expect a session
     * they can write to, never the readonly `git:` counterpart that may be
     * open alongside it in a diff view.
     */
    findEditorIdByPath(filePath: string): string | undefined {
        for (const [, entry] of this.editors) {
            if (entry.document.uri.scheme === "file" && entry.document.uri.path === filePath) {
                return entry.id;
            }
        }
        return undefined;
    }

    addToDisposals(editorId: string, disposable: Disposable): void {
        const subscriptions = this.disposables.get(editorId);
        if (subscriptions) {
            subscriptions.push(disposable);
        } else {
            this.disposables.set(editorId, [disposable]);
        }
    }

    subscribeToDisposeEvent(editorId: string, onDispose?: () => void): void {
        const entry = this.getEditorById(editorId);
        const d = this.disposables.get(editorId);
        entry.ui.onDidDispose(
            () => {
                this.disposeEditor(editorId, entry.ui);
                onDispose?.();
            },
            null,
            d,
        );
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
        const id = editorId;
        const entry = this.getEditorById(id);
        const d = this.disposables.get(id);
        entry.ui.webview.onDidReceiveMessage((e: Command) => callback(e, id), null, d);
    }

    /**
     * Returns a free-standing disposable (not scoped to an editor's list)
     * because SVG response handlers must outlive a single request/response
     * exchange without being tied to editor lifecycle.
     */
    subscribeToActiveEditorMessage(callback: (message: Command) => void): Disposable {
        const id = this.getActiveEditorId();
        const entry = this.getEditorById(id);
        return entry.ui.webview.onDidReceiveMessage((e: Command) => callback(e));
    }

    subscribeToDocumentChangeEvent(
        editorId: string,
        callback: (event: TextDocumentChangeEvent) => void,
    ): void {
        const d = this.disposables.get(editorId);
        workspace.onDidChangeTextDocument(callback, null, d);
    }

    subscribeToSettingChangeEvent(
        editorId: string,
        callback: (event: ConfigurationChangeEvent, editorId: string) => void,
    ): void {
        const id = editorId;
        const d = this.disposables.get(id);
        workspace.onDidChangeConfiguration((e) => callback(e, id), null, d);
    }

    subscribeToTabChangeEvent(editorId: string): void {
        const id = editorId;
        const entry = this.getEditorById(id);
        entry.ui.onDidChangeViewState(() => {
            if (entry.ui.active) {
                this.setActiveEditor(id);
            }
        });
    }

    /**
     * @throws If the editor is hidden and `retainContextWhenHidden` is not
     *   set, or if `webview.postMessage` returns `false`.
     */
    async postMessage(editorId: string, message: Command | Query): Promise<boolean> {
        const entry = this.getEditorById(editorId);

        if (!entry.ui.options.retainContextWhenHidden && !entry.ui.visible) {
            throw new Error("The active editor is hidden.");
        }
        if (await entry.ui.webview.postMessage(message)) {
            return true;
        } else {
            throw new Error("Failed to send message to the webview.");
        }
    }

    dispose(): void {
        this._onDidChangeActiveEditor.dispose();
    }

    private getEditorById(editorId: string): EditorEntry {
        const entry = this.editors.get(editorId);
        if (!entry) {
            throw new Error(`No editor found for id: ${editorId}`);
        }
        return entry;
    }

    /**
     * After disposal, the active-editor pointer moves to the most recently
     * opened remaining editor, or clears if none remain.
     */
    private disposeEditor(editorId: string, panel: WebviewPanel): void {
        panel.dispose();
        const subscriptions = this.disposables.get(editorId);
        subscriptions?.forEach((s) => s.dispose());
        this.disposables.delete(editorId);
        this.editors.delete(editorId);

        this.updateOpenEditorCounter(this.editors.size);

        if (this.activeEditorId === editorId) {
            const remaining = [...this.editors.keys()];
            const next = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
            this.activeEditorId = next;
            if (next) {
                this._onDidChangeActiveEditor.fire(next);
            }
        }
    }

    /**
     * Updates the context variable used by keybinding/menu `when` clauses.
     */
    private updateOpenEditorCounter(count: number): void {
        commands.executeCommand("setContext", OPEN_EDITORS_COUNTER_KEY, count);
    }
}
