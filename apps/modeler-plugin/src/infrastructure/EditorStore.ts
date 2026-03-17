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

import { getContext } from "./extensionContext";
import { Command, Query } from "@bpmn-modeler/shared";

import { bpmnEditorUi, dmnModelerHtml } from "./WebviewHtml";

/** VS Code view-type identifier for the BPMN custom editor. */
const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";
/** VS Code view-type identifier for the DMN custom editor. */
const DMN_VIEW_TYPE = "bpmn-modeler.dmn";
/** VS Code `setContext` command key used by keybinding/menu `when` clauses. */
const OPEN_EDITORS_COUNTER_KEY = "bpmn-modeler.openCustomEditors";

/** Per-editor state entry stored in the editors map. */
type EditorEntry = {
    id: string;
    ui: WebviewPanel;
    document: TextDocument;
};

/**
 * Central registry for all open modeler editors.
 *
 * Tracks editor state (webview panel, document, disposables) and provides all
 * subscription and messaging helpers needed by services and controllers.
 * Encapsulates the module-level globals that previously lived in
 * `adapter/out/editor.ts`.
 */
export class EditorStore implements Disposable {
    /** All currently open editors, keyed by document URI path. */
    private readonly editors: Map<string, EditorEntry> = new Map();

    /** VS Code event-subscription disposables, keyed by editorId. */
    private readonly disposables: Map<string, Disposable[]> = new Map();

    /** The document URI path of the editor that is currently focused. */
    private activeEditorId: string | undefined;

    /** Fires when the active editor changes, carrying the new editor's id. */
    private readonly _onDidChangeActiveEditor = new EventEmitter<string>();

    /** Event that fires when the active editor changes. */
    readonly onDidChangeActiveEditor: Event<string> =
        this._onDidChangeActiveEditor.event;

    // ─── Editor lifecycle ────────────────────────────────────────────────────

    /**
     * Registers a new editor entry, sets it as the active editor, and returns
     * the configured WebviewPanel.
     *
     * @param viewType VS Code view-type identifier (e.g. `"bpmn-modeler.bpmn"`).
     * @param editorId Document URI path used as the session key.
     * @param webviewPanel The panel provided by VS Code.
     * @param document The text document being edited.
     * @returns The configured WebviewPanel.
     */
    createEditor(
        viewType: string,
        editorId: string,
        webviewPanel: WebviewPanel,
        document: TextDocument,
    ): WebviewPanel {
        const panel = this.initWebviewHtml(viewType, webviewPanel);
        this.editors.set(editorId, { id: editorId, ui: panel, document });
        this.disposables.set(editorId, []);
        this.setActiveEditor(editorId);
        this.updateOpenEditorCounter(this.editors.size);
        return panel;
    }

    /**
     * Sets the webview HTML content on the panel based on the view type.
     *
     * @param viewType VS Code view-type identifier.
     * @param webviewPanel The panel whose HTML is to be set.
     * @returns The configured WebviewPanel.
     * @throws {Error} If the viewType is not supported.
     */
    initWebviewHtml(viewType: string, webviewPanel: WebviewPanel): WebviewPanel {
        const webview = webviewPanel.webview;
        webview.options = { enableScripts: true };

        if (viewType === BPMN_VIEW_TYPE) {
            webview.html = bpmnEditorUi(webview, getContext().extensionUri);
        } else if (viewType === DMN_VIEW_TYPE) {
            webview.html = dmnModelerHtml(webview, getContext().extensionUri);
        } else {
            throw new Error(`Unsupported view type: ${viewType}`);
        }

        return webviewPanel;
    }

    // ─── Active editor ────────────────────────────────────────────────────────

    /**
     * Updates the active editor pointer.
     * Called when the user switches to a different editor tab.
     *
     * @param id Document URI path of the editor that is now active.
     */
    setActiveEditor(id: string): void {
        if (id === this.activeEditorId) {
            return;
        }
        this.activeEditorId = id;
        this._onDidChangeActiveEditor.fire(id);
    }

    /**
     * Returns the document URI path of the currently focused editor.
     *
     * @throws {Error} If no editor is active.
     */
    getActiveEditorId(): string {
        if (!this.activeEditorId) {
            throw new Error("No active editor.");
        }
        return this.activeEditorId;
    }

    /**
     * Returns the TextDocument associated with the given editorId.
     *
     * @param editorId Document URI path of the target editor.
     * @throws {Error} If no editor with the given id is registered.
     */
    getDocumentForEditor(editorId: string): TextDocument {
        return this.getEditorById(editorId).document;
    }

    // ─── Disposables ─────────────────────────────────────────────────────────

    /**
     * Appends a disposable to the subscription list of the given editor so
     * it is automatically disposed when the editor is closed.
     *
     * @param editorId Document URI path of the target editor.
     * @param disposable The disposable to track.
     */
    addToDisposals(editorId: string, disposable: Disposable): void {
        const subscriptions = this.disposables.get(editorId);
        if (subscriptions) {
            subscriptions.push(disposable);
        } else {
            this.disposables.set(editorId, [disposable]);
        }
    }

    // ─── Event subscriptions ─────────────────────────────────────────────────

    /**
     * Subscribes to the panel-dispose event.  Cleans up the editor's state and
     * optionally invokes a caller-provided callback (e.g. to dispose session state).
     *
     * @param editorId Document URI path of the editor to observe.
     * @param onDispose Optional callback invoked after editor cleanup.
     */
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
     * Subscribes to messages received from the webview of the given editor.
     *
     * The editorId is captured at subscription time so the callback always
     * receives the id of the editor that owns this webview — not whatever
     * editor happens to be active when the message arrives.
     *
     * @param editorId Document URI path of the editor whose webview to listen to.
     * @param callback Invoked for every incoming message with the message and
     *   the captured editorId.
     */
    subscribeToMessageEvent(
        editorId: string,
        callback: (message: Command, editorId: string) => void,
    ): void {
        const id = editorId;
        const entry = this.getEditorById(id);
        const d = this.disposables.get(id);
        entry.ui.webview.onDidReceiveMessage(
            (e: Command) => callback(e, id),
            null,
            d,
        );
    }

    /**
     * Subscribes to messages from the currently active editor's webview.
     *
     * Used by the SVG commands that request the diagram SVG and need to receive
     * the response.  Unlike {@link subscribeToMessageEvent} this subscription
     * is not scoped to a specific editor's disposable list.
     *
     * @param callback Invoked for every message received from the active webview.
     * @returns A disposable that removes the subscription when disposed.
     */
    subscribeToActiveEditorMessage(callback: (message: Command) => void): Disposable {
        const id = this.getActiveEditorId();
        const entry = this.getEditorById(id);
        return entry.ui.webview.onDidReceiveMessage((e: Command) => callback(e));
    }

    /**
     * Subscribes to workspace-level text-document-change events for the
     * lifetime of the given editor.
     *
     * @param editorId Document URI path of the editor.
     * @param callback Invoked for every document-change event.
     */
    subscribeToDocumentChangeEvent(
        editorId: string,
        callback: (event: TextDocumentChangeEvent) => void,
    ): void {
        const d = this.disposables.get(editorId);
        workspace.onDidChangeTextDocument(callback, null, d);
    }

    /**
     * Subscribes to workspace configuration-change events for the lifetime of
     * the given editor.
     *
     * The editorId is captured at subscription time so the callback always
     * has the id of the editor it was created for.
     *
     * @param editorId Document URI path of the editor.
     * @param callback Invoked for every configuration-change event with the
     *   captured editorId.
     */
    subscribeToSettingChangeEvent(
        editorId: string,
        callback: (event: ConfigurationChangeEvent, editorId: string) => void,
    ): void {
        const id = editorId;
        const d = this.disposables.get(id);
        workspace.onDidChangeConfiguration(
            (e) => callback(e, id),
            null,
            d,
        );
    }

    /**
     * Subscribes to the panel-view-state-change event so that switching editor
     * tabs updates the active editor pointer.
     *
     * @param editorId Document URI path of the editor.
     */
    subscribeToTabChangeEvent(editorId: string): void {
        const id = editorId;
        const entry = this.getEditorById(id);
        entry.ui.onDidChangeViewState(() => {
            if (entry.ui.active) {
                this.setActiveEditor(id);
            }
        });
    }

    // ─── Messaging ───────────────────────────────────────────────────────────

    /**
     * Posts a message to the webview of the editor identified by editorId.
     *
     * @param editorId Target editor.
     * @param message The message or query to send.
     * @returns `true` if the message was delivered successfully.
     * @throws {Error} If the editor is hidden and `retainContextWhenHidden` is not set.
     * @throws {Error} If `postMessage` returns `false`.
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

    // ─── Disposal ──────────────────────────────────────────────────────────

    /**
     * Disposes the internal event emitter.
     */
    dispose(): void {
        this._onDidChangeActiveEditor.dispose();
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Returns the editor entry for the given editorId.
     *
     * @throws {Error} If no editor with the given id is registered.
     */
    private getEditorById(editorId: string): EditorEntry {
        const entry = this.editors.get(editorId);
        if (!entry) {
            throw new Error(`No editor found for id: ${editorId}`);
        }
        return entry;
    }

    /**
     * Cleans up all state associated with the given editor after its panel is
     * disposed.  Moves the active-editor pointer to the most recently opened
     * remaining editor, or clears it if none remain.
     *
     * @param editorId Document URI path of the disposed editor.
     * @param panel The panel that was disposed.
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
            const next =
                remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
            this.activeEditorId = next;
            if (next) {
                this._onDidChangeActiveEditor.fire(next);
            }
        }
    }

    /**
     * Updates the VS Code context variable used by keybinding/menu `when` clauses.
     *
     * @param count Current number of open modeler editors.
     */
    private updateOpenEditorCounter(count: number): void {
        commands.executeCommand("setContext", OPEN_EDITORS_COUNTER_KEY, count);
    }
}
