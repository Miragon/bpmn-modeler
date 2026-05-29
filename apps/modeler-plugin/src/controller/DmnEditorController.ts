import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
} from "vscode";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../infrastructure/EditorSessionStore";
import { VsCodeEditorHandle } from "../infrastructure/VsCodeEditorHandle";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";
import { DmnModelerService } from "../service/DmnModelerService";

// VS Code view-type identifier for the DMN custom editor.
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
     * @param notifier User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly dmnService: DmnModelerService,
        private readonly notifier: VsCodeNotifier,
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
            this.editorStore.register(
                VsCodeEditorHandle.create(DMN_VIEW_TYPE, editorId, webviewPanel, document),
            );
            this.dmnService.registerSession(editorId);

            this.subscribeToMessageEvent(editorId);
            this.subscribeToDocumentChangeEvent(editorId);
            this.editorStore.subscribeToTabChangeEvent(editorId);
            this.editorStore.subscribeToDisposeEvent(editorId, () => {
                this.dmnService.disposeSession(editorId);
            });
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Routes incoming DMN webview messages to the appropriate service method.
     */
    private subscribeToMessageEvent(editorId: string): void {
        this.editorStore.subscribeToMessageEvent(editorId, async (message: Command, id: string) => {
            this.notifier.logInfo(`Message received -> ${message.type}`);
            switch (message.type) {
                case "GetDmnFileCommand":
                    if (await this.dmnService.display(id)) {
                        this.notifier.logInfo("Dmn modeler is ready");
                    }
                    break;
                case "SyncDocumentCommand":
                    await this.dmnService.sync(id, (message as SyncDocumentCommand).content);
                    break;
            }
            this.notifier.logInfo(`Message processed -> ${message.type}`);
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
        this.editorStore.subscribeToDocumentChangeEvent(editorId, (event) => {
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(".dmn") &&
                editorId === event.documentUriString()
            ) {
                this.notifier.logInfo("OnDidChangeTextDocument -> display");
                this.dmnService.display(editorId);
            }
        });
    }
}
