import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    TextDocumentChangeEvent,
    WebviewPanel,
    window,
} from "vscode";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { DmnModelerService } from "../service/DmnModelerService";

/** VS Code view-type identifier for the DMN custom editor. */
const DMN_VIEW_TYPE = "bpmn-modeler.dmn";

/**
 * VS Code `CustomTextEditorProvider` for `.dmn` files.
 *
 * Mirrors the structure of {@link BpmnEditorController} but handles only the
 * two DMN-specific message types and has no artifact-watcher integration.
 */
export class DmnEditorController implements CustomTextEditorProvider {
    /**
     * @param editorStore Central registry for open editor panels and subscriptions.
     * @param dmnService DMN-specific business logic and session management.
     * @param vsUI User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorStore,
        private readonly dmnService: DmnModelerService,
        private readonly vsUI: VsCodeUI,
    ) {}

    /**
     * Registers this provider as the custom editor for `.dmn` files and adds
     * the resulting disposable to the extension context.
     *
     * Webview context is intentionally not retained on hide; the webview
     * re-fetches the document via `GetDmnFileCommand` on reload and
     * `WebviewStateManager` round-trips panel state through `vscode.setState`.
     *
     * @param context The VS Code extension context.
     */
    register(context: ExtensionContext): void {
        const provider = window.registerCustomEditorProvider(DMN_VIEW_TYPE, this);
        context.subscriptions.push(provider);
    }

    /**
     * Called by VS Code whenever a `.dmn` file is opened.
     *
     * Creates the editor session and wires all event subscriptions.
     *
     * @param document The text document being edited.
     * @param webviewPanel The webview panel provided by VS Code.
     * @param _token Cancellation token (unused).
     */
    resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): void | Thenable<void> {
        try {
            const editorId = document.uri.toString();
            this.editorStore.createEditor(DMN_VIEW_TYPE, editorId, webviewPanel, document);
            this.dmnService.registerSession(editorId);

            this.subscribeToMessageEvent(editorId);
            this.subscribeToDocumentChangeEvent(editorId);
            this.editorStore.subscribeToTabChangeEvent(editorId);
            this.editorStore.subscribeToDisposeEvent(editorId, () => {
                this.dmnService.disposeSession(editorId);
            });
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    // ─── Private subscription helpers ────────────────────────────────────────

    /**
     * Routes incoming DMN webview messages to the appropriate service method.
     *
     * @param editorId Document URI path of the editor whose webview to listen to.
     */
    private subscribeToMessageEvent(editorId: string): void {
        this.editorStore.subscribeToMessageEvent(editorId, async (message: Command, id: string) => {
            this.vsUI.logInfo(`Message received -> ${message.type}`);
            switch (message.type) {
                case "GetDmnFileCommand":
                    if (await this.dmnService.display(id)) {
                        this.vsUI.logInfo("Dmn modeler is ready");
                    }
                    break;
                case "SyncDocumentCommand":
                    await this.dmnService.sync(id, (message as SyncDocumentCommand).content);
                    break;
            }
            this.vsUI.logInfo(`Message processed -> ${message.type}`);
        });
    }

    /**
     * Subscribes to workspace document-change events.
     *
     * The editorId is captured at subscription time so the callback only
     * triggers display for the specific editor it was created for.
     *
     * @param editorId Document URI path of the target editor.
     */
    private subscribeToDocumentChangeEvent(editorId: string): void {
        this.editorStore.subscribeToDocumentChangeEvent(
            editorId,
            (event: TextDocumentChangeEvent) => {
                if (
                    event.contentChanges.length !== 0 &&
                    event.document.uri.path.endsWith(".dmn") &&
                    editorId === event.document.uri.toString()
                ) {
                    this.vsUI.logInfo("OnDidChangeTextDocument -> display");
                    this.dmnService.display(editorId);
                }
            },
        );
    }
}
