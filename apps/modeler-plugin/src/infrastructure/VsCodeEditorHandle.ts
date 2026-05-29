import { Disposable, Range, TextDocument, WebviewPanel, workspace, WorkspaceEdit } from "vscode";

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    DocumentChangeEvent,
    EditorHandle,
    EditorSubscription,
    SettingChange,
} from "../domain/EditorSession";
import { bootstrapWebview } from "./bootstrapWebview";

/**
 * VS Code adapter for {@link EditorHandle}: wraps a `WebviewPanel` + the
 * `TextDocument` it edits, plus a per-session disposables bag. This is the only
 * place that names `WebviewPanel`/`TextDocument`, which is what lets
 * `EditorSessionStore` and the services it feeds stay free of `vscode` —
 * mirroring how `WebviewPaneHandle` wraps the diff pane behind `DiffPaneHandle`.
 *
 * Document mutation (`writeContent`/`save`) lives here rather than in a separate
 * helper because only the holder of the concrete `TextDocument` can build the
 * `WorkspaceEdit`; the `DocumentPort` adapter just routes an `editorId` to this
 * handle.
 */
export class VsCodeEditorHandle implements EditorHandle {
    private readonly subscriptions: Disposable[] = [];

    private constructor(
        readonly id: string,
        private readonly panel: WebviewPanel,
        private readonly document: TextDocument,
    ) {}

    /**
     * Bootstraps the webview HTML and returns a ready handle. The webview is
     * configured before the session is registered so the first paint already
     * carries the persisted panel state.
     *
     * @param initialPanelVisible BPMN-only: pre-applied to the HTML so the
     *   properties panel never flashes open before the async state round-trip.
     */
    static create(
        viewType: string,
        editorId: string,
        webviewPanel: WebviewPanel,
        document: TextDocument,
        initialPanelVisible: boolean = true,
    ): VsCodeEditorHandle {
        const panel = bootstrapWebview(viewType, webviewPanel, initialPanelVisible);
        return new VsCodeEditorHandle(editorId, panel, document);
    }

    documentUriString(): string {
        return this.document.uri.toString();
    }

    documentPath(): string {
        return this.document.uri.path;
    }

    documentFsPath(): string {
        return this.document.uri.fsPath;
    }

    documentScheme(): string {
        return this.document.uri.scheme;
    }

    getContent(): string {
        return this.document.getText();
    }

    /**
     * Refuses non-`file:` schemes (e.g. `git:`) — those documents are owned by a
     * FileSystemProvider and any `applyEdit` against them either silently no-ops
     * or bubbles a confusing provider error. Reaching here with a non-file
     * document signals a missing viewer-mode branch upstream; fail loudly.
     *
     * @returns `true` if the edit was applied, `false` if content was unchanged.
     */
    async writeContent(content: string): Promise<boolean> {
        this.assertFileScheme("write to", "editable");

        if (this.document.getText() === content) {
            return false;
        }

        const edit = new WorkspaceEdit();
        edit.replace(this.document.uri, new Range(0, 0, this.document.lineCount, 0), content);
        return workspace.applyEdit(edit);
    }

    async save(): Promise<boolean> {
        this.assertFileScheme("save", "persistable");
        return this.document.save();
    }

    /**
     * @throws If the panel is hidden without `retainContextWhenHidden`, or if
     *   `webview.postMessage` returns `false`. The hidden case is load-bearing:
     *   callers (e.g. the script-task replay) detect this exact message to
     *   buffer the edit until the webview is shown again.
     */
    async postMessage(message: Command | Query): Promise<boolean> {
        if (!this.panel.options.retainContextWhenHidden && !this.panel.visible) {
            throw new Error("The active editor is hidden.");
        }
        if (await this.panel.webview.postMessage(message)) {
            return true;
        }
        throw new Error("Failed to send message to the webview.");
    }

    isActive(): boolean {
        return this.panel.active;
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
        this.panel.dispose();
        this.subscriptions.forEach((s) => s.dispose());
        this.subscriptions.length = 0;
    }

    onDidReceiveMessage(callback: (message: Command) => void): EditorSubscription {
        return this.panel.webview.onDidReceiveMessage((message: Command) => callback(message));
    }

    onDidDispose(callback: () => void): EditorSubscription {
        return this.panel.onDidDispose(() => callback());
    }

    onDidBecomeActive(callback: () => void): EditorSubscription {
        return this.panel.onDidChangeViewState(() => {
            if (this.panel.active) {
                callback();
            }
        });
    }

    /**
     * Wraps `workspace.onDidChangeTextDocument` — a *global* listener that fires
     * for every document, not just this session's. Callers filter by
     * {@link DocumentChangeEvent.documentUriString}; the narrow event shape
     * keeps that filtering host-agnostic.
     */
    onDidChangeDocument(callback: (event: DocumentChangeEvent) => void): EditorSubscription {
        return workspace.onDidChangeTextDocument((event) =>
            callback({
                hasContentChanges: () => event.contentChanges.length !== 0,
                documentUriString: () => event.document.uri.toString(),
                documentPath: () => event.document.uri.path,
            }),
        );
    }

    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription {
        // `ConfigurationChangeEvent` already satisfies `SettingChange` structurally.
        return workspace.onDidChangeConfiguration((event) => callback(event));
    }

    private assertFileScheme(verb: string, adjective: string): void {
        if (this.document.uri.scheme !== "file") {
            throw new Error(
                `Refusing to ${verb} a ${this.document.uri.scheme}: document ` +
                    `(${this.document.uri.toString()}). Only file:-scheme documents are ${adjective}.`,
            );
        }
    }
}
