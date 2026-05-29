import { commands, env, ExtensionContext, Uri, window, workspace } from "vscode";

import { setContext } from "./infrastructure/extensionContext";

import { BpmnScriptFileSystem } from "./infrastructure/BpmnScriptFileSystem";
import { CompareSelectionStore } from "./infrastructure/CompareSelectionStore";
import { DiffPaneStore } from "./infrastructure/DiffPaneStore";
import { EditorSessionStore } from "./infrastructure/EditorSessionStore";
import { PropertiesPanelStateRepository } from "./infrastructure/PropertiesPanelStateRepository";
import { VsCodeDocument } from "./infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "./infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeStatusBar } from "./infrastructure/VsCodeStatusBar";
import { VsCodeClipboard } from "./infrastructure/VsCodeClipboard";
import { VsCodeNotifier } from "./infrastructure/VsCodeNotifier";
import { VsCodePicker } from "./infrastructure/VsCodePicker";
import { VsCodeTextEditor } from "./infrastructure/VsCodeTextEditor";
import { WebviewMessageRouter } from "./infrastructure/WebviewMessageRouter";
import { ArtifactService } from "./service/ArtifactService";
import { BpmnDiffService } from "./service/BpmnDiffService";
import { BpmnModelerService } from "./service/BpmnModelerService";
import { BpmnClipboardMediator } from "./service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "./service/BpmnElementTemplatesService";
import { BpmnMigrationService } from "./service/BpmnMigrationService";
import { BpmnPropertiesPanelService } from "./service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "./service/BpmnSettingsBroadcaster";
import { DmnModelerService } from "./service/DmnModelerService";
import { ModelNavigationService } from "./service/ModelNavigationService";
import { ReferencedModelLocator } from "./service/modelNavigation/ReferencedModelLocator";
import { BpmnCompareController } from "./controller/BpmnCompareController";
import { BpmnDiffController } from "./controller/BpmnDiffController";
import { CommandController } from "./controller/CommandController";
import { ModelerEditorController } from "./controller/editor-session/ModelerEditorController";
import { BpmnRenderParticipant } from "./controller/editor-participants/BpmnRenderParticipant";
import { ElementTemplatesParticipant } from "./controller/editor-participants/ElementTemplatesParticipant";
import { SettingsParticipant } from "./controller/editor-participants/SettingsParticipant";
import { EngineVersionStatusBarParticipant } from "./controller/editor-participants/EngineVersionStatusBarParticipant";
import { ScriptTaskTeardownParticipant } from "./controller/editor-participants/ScriptTaskTeardownParticipant";
import { DmnRenderParticipant } from "./controller/editor-participants/DmnRenderParticipant";
import {
    getBpmnFileHandler,
    getElementTemplatesHandler,
    getBpmnModelerSettingHandler,
    resyncScriptTasksHandler,
    getPropertiesPanelStateHandler,
    setPropertiesPanelStateHandler,
    getClipboardHandler,
    setClipboardHandler,
    getTextClipboardHandler,
    setTextClipboardHandler,
    syncDocumentHandler,
    openScriptEditorHandler,
    navigateToReferencedModelHandler,
} from "./controller/webview-handlers/bpmnMessageHandlers";
import {
    getDmnFileHandler,
    syncDmnDocumentHandler,
} from "./controller/webview-handlers/dmnMessageHandlers";
import { ScriptCompletionProvider } from "./controller/ScriptCompletionProvider";
import { ScriptTaskService } from "./controller/ScriptTaskService";
import { VsCodeDeploymentState } from "./infrastructure/VsCodeDeploymentState";
import { VsCodeSecretStore } from "./infrastructure/VsCodeSecretStore";
import { FetchHttpClient } from "./infrastructure/FetchHttpClient";
import { AuthHeaderResolver } from "./infrastructure/camunda/AuthHeaderResolver";
import { Camunda7RestClient } from "./infrastructure/camunda/Camunda7RestClient";
import { Camunda8RestClient } from "./infrastructure/camunda/Camunda8RestClient";
import { CamundaEngineRouter } from "./infrastructure/camunda/CamundaEngineRouter";
import { DeploymentService } from "./service/DeploymentService";
import { StartInstanceService } from "./service/StartInstanceService";
import { DeploymentController } from "./controller/DeploymentController";

export function activate(context: ExtensionContext): void {
    notifyIfNewRelease(context);

    setContext(context);

    // The open-editor count drives the `when`-clause context key for
    // keybindings/menus. Injected here so the store names no `vscode` API.
    const editorStore = new EditorSessionStore((count) =>
        commands.executeCommand("setContext", "bpmn-modeler.openCustomEditors", count),
    );
    context.subscriptions.push(editorStore);
    const bpmnScriptFs = new BpmnScriptFileSystem();
    context.subscriptions.push(
        workspace.registerFileSystemProvider("bpmn-script", bpmnScriptFs, {
            isCaseSensitive: true,
        }),
    );
    const vsDocument = new VsCodeDocument(editorStore);
    const vsWorkspace = new VsCodeWorkspace();
    const vsSettings = new VsCodeSettings();
    const statusBar = new VsCodeStatusBar();
    const notifier = new VsCodeNotifier();
    const picker = new VsCodePicker(vsWorkspace);
    const clipboard = new VsCodeClipboard();
    const textEditor = new VsCodeTextEditor();
    const deploymentState = new VsCodeDeploymentState();
    const compareSelection = new CompareSelectionStore();
    const secretStore = new VsCodeSecretStore();
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const c7Client = new Camunda7RestClient(httpClient, authResolver);
    const c8Client = new Camunda8RestClient(httpClient, authResolver, vsSettings.getC8ApiVersion());
    const restClient = new CamundaEngineRouter(c7Client, c8Client);
    const panelStateRepo = new PropertiesPanelStateRepository(context);

    const artifactSvc = new ArtifactService(vsWorkspace, vsSettings);
    const bpmnService = new BpmnModelerService(
        editorStore,
        vsDocument,
        picker,
        statusBar,
        notifier,
    );
    const templatesSvc = new BpmnElementTemplatesService(
        editorStore,
        vsDocument,
        artifactSvc,
        statusBar,
        notifier,
    );
    const migrationSvc = new BpmnMigrationService(
        editorStore,
        vsDocument,
        vsWorkspace,
        picker,
        notifier,
    );
    const clipboardMediator = new BpmnClipboardMediator(editorStore, clipboard, notifier);
    const settingsBroadcaster = new BpmnSettingsBroadcaster(editorStore, vsSettings, notifier);
    const panelSvc = new BpmnPropertiesPanelService(editorStore, panelStateRepo, notifier);
    const dmnService = new DmnModelerService(editorStore, vsDocument, notifier);
    const diffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore);
    const diffService = new BpmnDiffService(notifier, vsSettings, diffStore);
    const diffController = new BpmnDiffController(diffStore, diffService, notifier);
    diffController.register(context);
    const deploymentSvc = new DeploymentService(
        vsDocument,
        vsWorkspace,
        deploymentState,
        restClient,
        notifier,
        picker,
        secretStore,
    );

    const startInstanceSvc = new StartInstanceService(
        vsDocument,
        vsWorkspace,
        restClient,
        notifier,
        picker,
        artifactSvc,
    );
    const referencedModelLocator = new ReferencedModelLocator(vsWorkspace, notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        notifier,
        picker,
    );

    const scriptTaskSvc = new ScriptTaskService(editorStore, bpmnScriptFs, notifier, picker);
    scriptTaskSvc.register(context);

    new ScriptCompletionProvider().register(context);

    const commandController = new CommandController(
        editorStore,
        vsDocument,
        notifier,
        textEditor,
        bpmnService,
        migrationSvc,
    );
    // One router per editor: both protocols carry `SyncDocumentCommand` but
    // route it to a different service, so they cannot share a dispatch table.
    // `GetBpmnModelerSettingCommand` registers two handlers, run in order:
    // broadcast settings/language, then resync scripts edited while hidden.
    const bpmnMessageRouter = new WebviewMessageRouter()
        .on("GetBpmnFileCommand", getBpmnFileHandler(bpmnService, notifier))
        .on("GetElementTemplatesCommand", getElementTemplatesHandler(templatesSvc))
        .on("GetBpmnModelerSettingCommand", getBpmnModelerSettingHandler(settingsBroadcaster))
        .on("GetBpmnModelerSettingCommand", resyncScriptTasksHandler(scriptTaskSvc))
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(panelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(panelSvc))
        .on("GetClipboardCommand", getClipboardHandler(clipboardMediator))
        .on("SetClipboardCommand", setClipboardHandler(clipboardMediator))
        .on("GetTextClipboardCommand", getTextClipboardHandler(clipboardMediator))
        .on("SetTextClipboardCommand", setTextClipboardHandler(clipboardMediator))
        .on("SyncDocumentCommand", syncDocumentHandler(bpmnService))
        .on("OpenScriptEditorCommand", openScriptEditorHandler(scriptTaskSvc))
        .on(
            "NavigateToReferencedModelCommand",
            navigateToReferencedModelHandler(editorStore, modelNavigationService, notifier),
        );
    const dmnMessageRouter = new WebviewMessageRouter()
        .on("GetDmnFileCommand", getDmnFileHandler(dmnService, notifier))
        .on("SyncDocumentCommand", syncDmnDocumentHandler(dmnService));

    new ModelerEditorController(editorStore, notifier, {
        viewType: "bpmn-modeler.bpmn",
        messageRouter: bpmnMessageRouter,
        participants: [
            new BpmnRenderParticipant(bpmnService, notifier),
            new ElementTemplatesParticipant(templatesSvc, artifactSvc, notifier),
            new SettingsParticipant(settingsBroadcaster),
            new EngineVersionStatusBarParticipant(statusBar, vsDocument),
            new ScriptTaskTeardownParticipant(scriptTaskSvc),
        ],
        // Diff routing: when the URI resolves as a diff pane the diff controller
        // owns it, so signal "handled" and skip editor-session creation.
        delegateResolve: (document, panel) => {
            if (!diffController.shouldResolveAsDiff(document.uri)) {
                return false;
            }
            diffController.resolveDiffPane(panel, document);
            return true;
        },
        initialPanelVisible: () => panelSvc.getPersistedPanelVisibility(),
    }).register(context);
    new ModelerEditorController(editorStore, notifier, {
        viewType: "bpmn-modeler.dmn",
        messageRouter: dmnMessageRouter,
        participants: [new DmnRenderParticipant(dmnService, notifier)],
    }).register(context);
    new BpmnCompareController(compareSelection, diffController, notifier).register(context);
    commandController.register(context);
    new DeploymentController(
        editorStore,
        vsDocument,
        deploymentSvc,
        startInstanceSvc,
        notifier,
    ).register(context);
}

const RELEASES_BASE = "https://github.com/Miragon/bpmn-modeler/releases/tag";
const LAST_NOTIFIED_KEY = "lastNotifiedVersion";

function notifyIfNewRelease(context: ExtensionContext): void {
    const current: string = context.extension.packageJSON.version;
    const last = context.globalState.get<string>(LAST_NOTIFIED_KEY);

    if (current === last) {
        return;
    }

    // Persist before showing so a crash/dismiss never re-triggers the prompt.
    context.globalState.update(LAST_NOTIFIED_KEY, current);

    window
        .showInformationMessage(
            `BPMN Modeler updated to v${current}. See what's new!`,
            "View Release Notes",
        )
        .then((selection) => {
            if (selection === "View Release Notes") {
                env.openExternal(Uri.parse(`${RELEASES_BASE}/v${current}`));
            }
        });
}
