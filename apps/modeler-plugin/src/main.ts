import { env, ExtensionContext, Uri, window, workspace } from "vscode";

import { setContext } from "./infrastructure/extensionContext";

import { BpmnScriptFileSystem } from "./infrastructure/BpmnScriptFileSystem";
import { CompareSelectionStore } from "./infrastructure/CompareSelectionStore";
import { EditorStore } from "./infrastructure/EditorStore";
import { PropertiesPanelStateRepository } from "./infrastructure/PropertiesPanelStateRepository";
import { VsCodeDocument } from "./infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "./infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeStatusBar } from "./infrastructure/VsCodeStatusBar";
import { VsCodeClipboard } from "./infrastructure/VsCodeClipboard";
import { VsCodeNotifier } from "./infrastructure/VsCodeNotifier";
import { VsCodePicker } from "./infrastructure/VsCodePicker";
import { ArtifactService } from "./service/ArtifactService";
import { BpmnDiffService } from "./service/BpmnDiffService";
import { BpmnModelerService } from "./service/BpmnModelerService";
import { DmnModelerService } from "./service/DmnModelerService";
import { ModelNavigationService } from "./service/ModelNavigationService";
import { ReferencedModelLocator } from "./service/modelNavigation/ReferencedModelLocator";
import { ScriptCompletionProvider } from "./service/ScriptCompletionProvider";
import { ScriptTaskService } from "./service/ScriptTaskService";
import { BpmnCompareController } from "./controller/BpmnCompareController";
import { CommandController } from "./controller/CommandController";
import { BpmnEditorController } from "./controller/BpmnEditorController";
import { DmnEditorController } from "./controller/DmnEditorController";
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

    const editorStore = new EditorStore();
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
        vsSettings,
        notifier,
        picker,
        clipboard,
        artifactSvc,
        statusBar,
        vsWorkspace,
        panelStateRepo,
    );
    const dmnService = new DmnModelerService(editorStore, vsDocument, notifier);
    const diffService = new BpmnDiffService(notifier, vsSettings);
    context.subscriptions.push(diffService);
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
        artifactSvc,
    );
    const referencedModelLocator = new ReferencedModelLocator(vsWorkspace, notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        notifier,
        picker,
    );

    const scriptTaskSvc = new ScriptTaskService(editorStore, bpmnScriptFs, notifier);
    scriptTaskSvc.register(context);

    new ScriptCompletionProvider().register(context);

    const commandController = new CommandController(editorStore, vsDocument, notifier, bpmnService);
    new BpmnEditorController(
        editorStore,
        bpmnService,
        diffService,
        artifactSvc,
        scriptTaskSvc,
        notifier,
        vsDocument,
        statusBar,
        modelNavigationService,
    ).register(context);
    new DmnEditorController(editorStore, dmnService, notifier).register(context);
    new BpmnCompareController(compareSelection, diffService, notifier).register(context);
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
