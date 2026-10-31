import {
    Disposable,
    Range,
    Tab,
    TabInputCustom,
    TextDocument,
    WebviewPanel,
    window,
    workspace,
    WorkspaceEdit,
} from "vscode";

import { Command, Query } from "@miragon/bpmn-modeler-shared";

import {
    DocumentChangeEvent,
    EditorHandle,
    EditorSubscription,
    SettingChange,
} from "@miragon/bpmn-modeler-core";
import { bootstrapWebview } from "./bootstrapWebview";
import { onDidChangeModelerSetting } from "./modelerConfiguration";
import { canonicalPath } from "./uriPath";

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
    private disposed = false;

    private constructor(
        readonly id: string,
        private readonly panel: WebviewPanel,
        private readonly document: TextDocument,
        // Retained so reload() can rebuild the exact same HTML the session
        // opened with (viewType branches BPMN vs. DMN; the visibility flag
        // keeps the properties panel from flashing on the re-render).
        private readonly viewType: string,
        private readonly initialPanelVisible: boolean,
    ) {}

    /**
     * Bootstraps the webview HTML and returns a ready handle. The webview is
     * configured before the session is registered so the first paint already
     * carries the persisted panel state.
     *
     * @param initialPanelVisible The host's global default, pre-applied to the
     *   HTML (BPMN and DMN) so the properties panel never flashes before the
     *   webview settles. A webview with its own persisted per-editor
     *   `panelVisible` entry overrides this at runtime.
     */
    static create(
        viewType: string,
        editorId: string,
        webviewPanel: WebviewPanel,
        document: TextDocument,
        initialPanelVisible: boolean = true,
    ): VsCodeEditorHandle {
        const panel = bootstrapWebview(viewType, webviewPanel, initialPanelVisible);
        return new VsCodeEditorHandle(editorId, panel, document, viewType, initialPanelVisible);
    }

    documentUriString(): string {
        return this.document.uri.toString();
    }

    documentPath(): string {
        return canonicalPath(this.document.uri);
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
     * Refuses documents on a read-only file system (e.g. `git:`, the compare
     * viewer's provider) — an `applyEdit` against those either silently no-ops
     * or bubbles a confusing provider error. Reaching here with a read-only
     * document signals a missing viewer-mode branch upstream; fail loudly.
     *
     * @returns `true` if the edit was applied, `false` if content was unchanged
     * or VS Code did not apply the edit.
     */
    async writeContent(content: string, _expectedDocumentRevision?: number): Promise<boolean> {
        this.assertWritableFileSystem("write to", "editable");

        if (this.document.getText() === content) {
            return false;
        }

        const edit = new WorkspaceEdit();
        edit.replace(this.document.uri, new Range(0, 0, this.document.lineCount, 0), content);
        return workspace.applyEdit(edit);
    }

    async save(): Promise<boolean> {
        this.assertWritableFileSystem("save", "persistable");
        // VS Code answers false for a read-only document even when it has
        // nothing to save; a failed write leaves the document dirty.
        return (await this.document.save()) || !this.document.isDirty;
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

    /**
     * Re-assigns `webview.html` (with a fresh nonce) to restart the webview app
     * in place. Reloading always retears the iframe even for identical content,
     * so the restarted app re-runs its startup handshake — re-requesting the
     * document (its dirty `TextDocument` text survives), element templates, and
     * settings. Equivalent to switching away from and back to a non-retained tab.
     */
    reload(): void {
        bootstrapWebview(this.viewType, this.panel, this.initialPanelVisible);
    }

    /**
     * Theia creates every panel active and visible and may never correct that
     * for a restored background tab, so a panel also needs its group to show
     * its tab. A panel without a custom-editor tab (a diff) keeps its own state.
     */
    isActive(): boolean {
        return this.panel.active && this.panel.visible && this.isTabShown();
    }

    private isTabShown(): boolean {
        const tabs = window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter((tab) => this.isOwnTab(tab));
        return tabs.length === 0 || tabs.some((tab) => tab.isActive);
    }

    private isOwnTab(tab: Tab): boolean {
        return (
            tab.input instanceof TabInputCustom &&
            tab.input.viewType === this.viewType &&
            tab.input.uri.toString() === this.document.uri.toString()
        );
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
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

    /**
     * A tab change reports only a flip of {@link isActive}, since tabs change on
     * every edit. The tab listeners are global and must end with the panel,
     * whose state throws once it is disposed.
     */
    onDidChangeActive(callback: (active: boolean) => void): EditorSubscription {
        let reportedActive = this.isActive();
        const report = () => {
            reportedActive = this.isActive();
            callback(reportedActive);
        };
        const reportFlip = () => {
            if (this.isActive() !== reportedActive) report();
        };
        const tabSubscriptions = [
            window.tabGroups.onDidChangeTabs(reportFlip),
            window.tabGroups.onDidChangeTabGroups(reportFlip),
        ];
        const disposeTabSubscriptions = () =>
            tabSubscriptions.forEach((subscription) => subscription.dispose());
        const subscriptions = [
            this.panel.onDidChangeViewState(report),
            this.panel.onDidDispose(disposeTabSubscriptions),
        ];
        return {
            dispose: () => {
                subscriptions.forEach((subscription) => subscription.dispose());
                disposeTabSubscriptions();
            },
        };
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
                documentPath: () => canonicalPath(event.document.uri),
            }),
        );
    }

    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription {
        return onDidChangeModelerSetting(callback);
    }

    /**
     * The gate is the file system's writability, not the `file:` scheme: a
     * document served by a custom, writable FileSystemProvider (a collaborative
     * `bpm-live:` model, `memfs:`, …) is as editable as one on disk, and VS Code
     * answers for every registered provider. `undefined` means no provider is
     * known for the scheme (e.g. `untitled:`) — refused, as before.
     */
    private assertWritableFileSystem(verb: string, adjective: string): void {
        const scheme = this.document.uri.scheme;
        if (scheme !== "file" && workspace.fs.isWritableFileSystem(scheme) !== true) {
            throw new Error(
                `Refusing to ${verb} a ${scheme}: document (${this.document.uri.toString()}). ` +
                    `Only documents on a writable file system are ${adjective}.`,
            );
        }
    }
}
