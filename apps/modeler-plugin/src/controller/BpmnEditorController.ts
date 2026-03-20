import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    TextDocumentChangeEvent,
    WebviewPanel,
    window,
} from "vscode";

import {
    Command,
    SetClipboardCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
} from "@bpmn-modeler/shared";

import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeStatusBar } from "../infrastructure/VsCodeStatusBar";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { BpmnModelerService } from "../service/BpmnModelerService";
import { ArtifactService } from "../service/ArtifactService";
import { detectExecutionPlatform, detectExecutionPlatformVersion } from "../service/bpmnUtils";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";

/** VS Code view-type identifier for the BPMN custom editor. */
const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

/**
 * VS Code `CustomTextEditorProvider` for `.bpmn` files.
 *
 * Thin wiring layer: creates the editor session, sets up all VS Code event
 * subscriptions, and delegates all business logic to {@link BpmnModelerService}
 * and {@link ArtifactService}.
 */
export class BpmnEditorController implements CustomTextEditorProvider {
    /**
     * @param editorStore Central registry for open editor panels and subscriptions.
     * @param bpmnService BPMN-specific business logic and session management.
     * @param artifactSvc Workspace artifact discovery and watcher creation.
     * @param vsUI User-facing message and logging helper.
     * @param vsDocument Active-document read helper (for status bar version detection).
     * @param statusBar Status bar item manager for engine version display.
     */
    constructor(
        private readonly editorStore: EditorStore,
        private readonly bpmnService: BpmnModelerService,
        private readonly artifactSvc: ArtifactService,
        private readonly vsUI: VsCodeUI,
        private readonly vsDocument: VsCodeDocument,
        private readonly statusBar: VsCodeStatusBar,
    ) {}

    /**
     * Registers this provider as the custom editor for `.bpmn` files and adds
     * the resulting disposable to the extension context.
     *
     * @param context The VS Code extension context.
     */
    register(context: ExtensionContext): void {
        const provider = window.registerCustomEditorProvider(BPMN_VIEW_TYPE, this);
        context.subscriptions.push(provider);
    }

    /**
     * Called by VS Code whenever a `.bpmn` file is opened.
     *
     * Creates the editor session, registers all event subscriptions, and starts
     * filesystem watchers for artifact directories (forms, element templates).
     *
     * @param document The text document being edited.
     * @param webviewPanel The webview panel provided by VS Code.
     * @param _token Cancellation token (unused).
     */
    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        try {
            const editorId = document.uri.path;
            this.editorStore.createEditor(
                BPMN_VIEW_TYPE,
                editorId,
                webviewPanel,
                document,
            );
            this.bpmnService.registerSession(editorId);

            this.subscribeToMessageEvent(editorId);
            this.subscribeToDocumentChangeEvent(editorId);
            this.subscribeToSettingChangeEvent(editorId);
            this.subscribeToViewStateChangeEvent(editorId, webviewPanel);
            this.editorStore.subscribeToTabChangeEvent(editorId);
            this.editorStore.subscribeToDisposeEvent(editorId, () => {
                this.bpmnService.disposeSession(editorId);
                this.statusBar.hideEngineVersion();
            });

            const { disposables, errors } = await this.artifactSvc.createWatcher(
                editorId,
                this.bpmnService,
            );
            for (const d of disposables) {
                this.editorStore.addToDisposals(editorId, d);
            }
            for (const error of errors) {
                this.vsUI.showError(error.message);
                this.vsUI.logError(error);
            }
        } catch (error) {
            this.vsUI.showError((error as Error).message);
            this.vsUI.logError(error as Error);
        }
    }

    // ─── Private subscription helpers ────────────────────────────────────────

    /**
     * Routes incoming webview messages to the appropriate service method.
     *
     * The session guard for `SyncDocumentCommand` is managed inside
     * {@link BpmnModelerService.sync}, keeping this controller free of guard logic.
     *
     * @param editorId Document URI path of the editor whose webview to listen to.
     */
    private subscribeToMessageEvent(editorId: string): void {
        this.editorStore.subscribeToMessageEvent(
            editorId,
            async (message: Command, id: string) => {
                this.vsUI.logInfo(`Message received -> ${message.type}`);
                switch (message.type) {
                    case "GetBpmnFileCommand":
                        if (await this.bpmnService.display(id)) {
                            this.vsUI.logInfo("Bpmn modeler is ready");
                        }
                        break;
                    case "GetElementTemplatesCommand":
                        this.bpmnService.setElementTemplates(id);
                        break;
                    case "GetBpmnModelerSettingCommand":
                        this.bpmnService.setSettings(id);
                        this.bpmnService.setLanguage(id);
                        break;
                    case "GetClipboardCommand":
                        this.bpmnService.readClipboard(id);
                        break;
                    case "SetClipboardCommand":
                        this.bpmnService.writeClipboard(
                            (message as SetClipboardCommand).text,
                        );
                        break;
                    case "GetTextClipboardCommand":
                        this.bpmnService.readTextClipboard(id);
                        break;
                    case "SetTextClipboardCommand":
                        this.bpmnService.writeClipboard(
                            (message as SetTextClipboardCommand).text,
                        );
                        break;
                    case "SyncDocumentCommand":
                        await this.bpmnService.sync(
                            id,
                            (message as SyncDocumentCommand).content,
                        );
                        break;
                }
                this.vsUI.logInfo(`Message processed -> ${message.type}`);
            },
        );
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
                    editorId.split(".").pop() === "bpmn" &&
                    editorId === event.document.uri.path
                ) {
                    this.vsUI.logInfo("OnDidChangeTextDocument -> display");
                    this.bpmnService.display(editorId);
                }
            },
        );
    }

    /**
     * Subscribes to VS Code configuration changes and forwards relevant
     * setting updates to the webview.
     *
     * @param editorId Document URI path of the target editor.
     */
    private subscribeToSettingChangeEvent(editorId: string): void {
        this.editorStore.subscribeToSettingChangeEvent(editorId, (event, id) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.alignToOrigin")) {
                this.bpmnService.setSettings(id);
            }
            if (event.affectsConfiguration("miragon.bpmnModeler.showTransactionBoundaries")) {
                this.bpmnService.setSettings(id);
            }
            if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                this.bpmnService.setElementTemplates(id);
            }
            if (event.affectsConfiguration("miragon.bpmnModeler.language")) {
                this.bpmnService.setLanguage(id);
            }
        });
    }

    /**
     * Subscribes to webview panel view-state changes to show or hide the
     * engine version status bar item when the BPMN editor gains or loses focus.
     *
     * @param editorId Document URI path of the target editor.
     * @param webviewPanel The webview panel to observe.
     */
    private subscribeToViewStateChangeEvent(
        editorId: string,
        webviewPanel: WebviewPanel,
    ): void {
        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) {
                this.updateEngineVersionStatusBar(editorId);
            } else {
                this.statusBar.hideEngineVersion();
            }
        });
    }

    /**
     * Reads the current document content and updates the engine-version status
     * bar with the detected platform and version.
     *
     * @param editorId Document URI path of the target editor.
     */
    private updateEngineVersionStatusBar(editorId: string): void {
        try {
            const content = this.vsDocument.getContent(editorId);
            if (content === "") {
                return;
            }
            const platform = detectExecutionPlatform(content);
            const version = detectExecutionPlatformVersion(content);
            if (version) {
                this.statusBar.showEngineVersion(platform, version);
            }
        } catch {
            // If detection fails (e.g. no platform yet), hide the status bar.
            this.statusBar.hideEngineVersion();
        }
    }
}
