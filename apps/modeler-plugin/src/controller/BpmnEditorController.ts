import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
} from "vscode";

import {
    Command,
    OpenScriptEditorCommand,
    NavigateToReferencedModelCommand,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../infrastructure/EditorSessionStore";
import { VsCodeEditorHandle } from "../infrastructure/VsCodeEditorHandle";
import { VsCodeStatusBar } from "../infrastructure/VsCodeStatusBar";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";
import { BpmnModelerService } from "../service/BpmnModelerService";
import { BpmnClipboardMediator } from "../service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "../service/BpmnElementTemplatesService";
import { BpmnPropertiesPanelService } from "../service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../service/BpmnSettingsBroadcaster";
import { BpmnDiffController } from "./BpmnDiffController";
import { ArtifactService } from "../service/ArtifactService";
import { ScriptTaskService } from "./ScriptTaskService";
import { ModelNavigationService } from "../service/ModelNavigationService";
import { BpmnDocument } from "../domain/BpmnDocument";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";

// VS Code view-type identifier for the BPMN custom editor.
const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

/**
 * VS Code `CustomTextEditorProvider` for `.bpmn` files.
 *
 * Thin wiring layer: creates the editor session, sets up all VS Code event
 * subscriptions, and fans webview messages out to the focused BPMN
 * services (modeler, templates, settings, panel, clipboard).
 */
export class BpmnEditorController implements CustomTextEditorProvider {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly bpmnService: BpmnModelerService,
        private readonly templatesSvc: BpmnElementTemplatesService,
        private readonly settingsBroadcaster: BpmnSettingsBroadcaster,
        private readonly panelSvc: BpmnPropertiesPanelService,
        private readonly clipboardMediator: BpmnClipboardMediator,
        private readonly diffController: BpmnDiffController,
        private readonly artifactSvc: ArtifactService,
        private readonly scriptTaskSvc: ScriptTaskService,
        private readonly notifier: VsCodeNotifier,
        private readonly vsDocument: VsCodeDocument,
        private readonly statusBar: VsCodeStatusBar,
        private readonly modelNavigationService: ModelNavigationService,
    ) {}

    /**
     * Registers this provider as the custom editor for `.bpmn` files and adds
     * the resulting disposable to the extension context.
     *
     * Webview context is intentionally not retained on hide; the webview
     * re-fetches the document via `GetBpmnFileCommand` on reload and
     * `WebviewStateManager` round-trips viewport / selection / panel state
     * through `vscode.setState`.
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
     */
    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        try {
            /**
             * Diff branch: the diff controller decides whether this URI
             * should resolve as a diff pane.  It checks, in order: a
             * pre-registered `compare-files` session (our own command), `git:`
             * scheme (always readonly, always SCM), or the label-based SCM
             * diff heuristic — while also guarding against a *second* resolve
             * for a URI that already has a pane (e.g. user opens the
             * working-tree file in a normal editor tab while the SCM diff
             * is still open).
             */
            if (this.diffController.shouldResolveAsDiff(document.uri)) {
                this.diffController.resolveDiffPane(webviewPanel, document);
                return;
            }

            const editorId = document.uri.toString();

            // Pre-apply the persisted panel visibility to the webview HTML so
            // the panel never flashes open before the async GetPropertiesPanelStateCommand
            // round-trip completes.
            this.editorStore.register(
                VsCodeEditorHandle.create(
                    BPMN_VIEW_TYPE,
                    editorId,
                    webviewPanel,
                    document,
                    this.panelSvc.getPersistedPanelVisibility(),
                ),
            );
            this.bpmnService.registerSession(editorId);

            this.subscribeToMessageEvent(editorId);
            this.subscribeToDocumentChangeEvent(editorId);
            this.settingsBroadcaster.subscribe(editorId);
            this.subscribeToConfigFolderChangeEvent(editorId);
            this.subscribeToViewStateChangeEvent(editorId, webviewPanel);
            this.editorStore.subscribeToTabChangeEvent(editorId);
            this.editorStore.subscribeToDisposeEvent(editorId, () => {
                this.bpmnService.disposeSession(editorId);
                this.statusBar.hideEngineVersion();
                this.scriptTaskSvc.disposeForEditor(editorId);
            });

            const { disposables, errors } = await this.artifactSvc.createWatcher(
                editorId,
                this.templatesSvc,
            );
            for (const d of disposables) {
                this.editorStore.addToDisposals(editorId, d);
            }
            for (const error of errors) {
                this.notifier.showError(error.message);
                this.notifier.logError(error);
            }
        } catch (error) {
            this.notifier.showError((error as Error).message);
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Routes incoming webview messages to the appropriate service method.
     *
     * The session guard for `SyncDocumentCommand` is managed inside
     * {@link BpmnModelerService.sync}, keeping this controller free of guard logic.
     */
    private subscribeToMessageEvent(editorId: string): void {
        this.editorStore.subscribeToMessageEvent(editorId, async (message: Command, id: string) => {
            this.notifier.logInfo(`Message received -> ${message.type}`);
            switch (message.type) {
                case "GetBpmnFileCommand":
                    if (await this.bpmnService.display(id)) {
                        this.notifier.logInfo("Bpmn modeler is ready");
                    }
                    break;
                case "GetElementTemplatesCommand":
                    this.templatesSvc.setElementTemplates(id);
                    break;
                case "GetBpmnModelerSettingCommand":
                    this.settingsBroadcaster.setSettings(id);
                    this.settingsBroadcaster.setLanguage(id);
                    this.scriptTaskSvc.resyncOpenDocuments(id); // (re)load for changes while webview was hidden
                    break;
                case "GetPropertiesPanelStateCommand":
                    this.panelSvc.sendPropertiesPanelState(id);
                    break;
                case "SetPropertiesPanelStateCommand":
                    this.panelSvc.setPropertiesPanelVisibility(
                        (message as SetPropertiesPanelStateCommand).visible,
                    );
                    break;
                case "GetClipboardCommand":
                    this.clipboardMediator.readClipboard(id);
                    break;
                case "SetClipboardCommand":
                    this.clipboardMediator.writeClipboard((message as SetClipboardCommand).text);
                    break;
                case "GetTextClipboardCommand":
                    this.clipboardMediator.readTextClipboard(id);
                    break;
                case "SetTextClipboardCommand":
                    this.clipboardMediator.writeClipboard(
                        (message as SetTextClipboardCommand).text,
                    );
                    break;
                case "SyncDocumentCommand":
                    await this.bpmnService.sync(id, (message as SyncDocumentCommand).content);
                    break;
                case "OpenScriptEditorCommand": {
                    const cmd = message as OpenScriptEditorCommand;
                    await this.scriptTaskSvc.openScriptEditor(
                        id,
                        cmd.elementId,
                        cmd.kind,
                        cmd.listenerIndex,
                        cmd.eventName,
                        cmd.scriptFormat,
                        cmd.content,
                    );
                    break;
                }
                case "NavigateToReferencedModelCommand": {
                    const cmd = message as NavigateToReferencedModelCommand;
                    /**
                     * Defence-in-depth: reject unknown discriminants
                     * rather than letting them fall through to the
                     * decision branch by default.
                     */
                    if (cmd.referenceKind !== "process" && cmd.referenceKind !== "decision") {
                        this.notifier.logWarning(
                            `Ignoring NavigateToReferencedModelCommand with unknown kind: ${String(
                                cmd.referenceKind,
                            )}`,
                        );
                        break;
                    }
                    const sourceFsPath = this.editorStore.requireHandle(id).documentFsPath();
                    await this.modelNavigationService.navigate(
                        cmd.referenceId,
                        cmd.referenceKind,
                        sourceFsPath,
                    );
                    break;
                }
            }
            this.notifier.logInfo(`Message processed -> ${message.type}`);
        });
    }

    /**
     * Subscribes to workspace document-change events.
     *
     * The editorId is captured at subscription time so the callback only
     * triggers display for the specific editor it was created for.
     */
    private subscribeToDocumentChangeEvent(editorId: string): void {
        this.editorStore.subscribeToDocumentChangeEvent(editorId, (event) => {
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(".bpmn") &&
                editorId === event.documentUriString()
            ) {
                this.notifier.logInfo("OnDidChangeTextDocument -> display");
                this.bpmnService.display(editorId);
            }
        });
    }

    /**
     * Re-loads element templates when the `configFolder` setting changes.
     * Other modeler settings are owned by
     * {@link BpmnSettingsBroadcaster.subscribe}; only the templates branch
     * stays here because it lives in a different service.
     */
    private subscribeToConfigFolderChangeEvent(editorId: string): void {
        this.editorStore.subscribeToSettingChangeEvent(editorId, (event, id) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                this.templatesSvc.setElementTemplates(id);
            }
        });
    }

    /**
     * Subscribes to webview panel view-state changes to show or hide the
     * engine version status bar item when the BPMN editor gains or loses focus.
     */
    private subscribeToViewStateChangeEvent(editorId: string, webviewPanel: WebviewPanel): void {
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
     */
    private updateEngineVersionStatusBar(editorId: string): void {
        try {
            const doc = new BpmnDocument(this.vsDocument.getContent(editorId));
            if (doc.isEmpty()) {
                return;
            }
            const platform = doc.detectPlatform();
            const version = doc.detectPlatformVersion();
            if (version) {
                this.statusBar.showEngineVersion(platform, version);
            }
        } catch {
            // If detection fails (e.g. no platform yet), hide the status bar.
            this.statusBar.hideEngineVersion();
        }
    }
}
