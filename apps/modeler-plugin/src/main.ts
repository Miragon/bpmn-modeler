import { env, EventEmitter, ExtensionContext, Uri, window } from "vscode";

import { setContext } from "./infrastructure/extensionContext";

import type { BpmnModelerApi } from "./api";
import { CompareSelectionStore } from "./infrastructure/CompareSelectionStore";
import { EditorStore } from "./infrastructure/EditorStore";
import { PropertiesPanelStateRepository } from "./infrastructure/PropertiesPanelStateRepository";
import { VsCodeDocument } from "./infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "./infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeStatusBar } from "./infrastructure/VsCodeStatusBar";
import { VsCodeUI } from "./infrastructure/VsCodeUI";
import { ArtifactService } from "./service/ArtifactService";
import { BpmnDiffService } from "./service/BpmnDiffService";
import { BpmnModelerService } from "./service/BpmnModelerService";
import { DmnModelerService } from "./service/DmnModelerService";
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

/**
 * VS Code extension entry point.
 *
 * Wires up all infrastructure, services, and controllers using plain
 * constructor injection — no DI framework required.
 *
 * Returns a {@link BpmnModelerApi} so other extensions (e.g. the bpmn-iq
 * plugin) can subscribe to selection-changed events without importing
 * extension-internal types.
 */
export function activate(context: ExtensionContext): BpmnModelerApi {
    // 0. Notify the user of a new release (once per version).
    notifyIfNewRelease(context);

    // 1. Make the extension context globally available for helpers that need it.
    setContext(context);

    // 2. Infrastructure
    const editorStore = new EditorStore();
    context.subscriptions.push(editorStore);
    const vsDocument = new VsCodeDocument(editorStore);
    const vsWorkspace = new VsCodeWorkspace();
    const vsSettings = new VsCodeSettings();
    const statusBar = new VsCodeStatusBar();
    const vsUI = new VsCodeUI();
    const deploymentState = new VsCodeDeploymentState();
    const compareSelection = new CompareSelectionStore();
    const secretStore = new VsCodeSecretStore();
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const c7Client = new Camunda7RestClient(httpClient, authResolver);
    const c8Client = new Camunda8RestClient(httpClient, authResolver, vsSettings.getC8ApiVersion());
    const restClient = new CamundaEngineRouter(c7Client, c8Client);
    const panelStateRepo = new PropertiesPanelStateRepository(context);

    // 3. Services
    const artifactSvc = new ArtifactService(vsWorkspace, vsSettings);
    const bpmnService = new BpmnModelerService(
        editorStore,
        vsDocument,
        vsSettings,
        vsUI,
        artifactSvc,
        statusBar,
        vsWorkspace,
        panelStateRepo,
    );
    const dmnService = new DmnModelerService(editorStore, vsDocument, vsUI);
    const diffService = new BpmnDiffService(vsUI, vsSettings);
    context.subscriptions.push(diffService);
    const deploymentSvc = new DeploymentService(
        vsDocument,
        vsWorkspace,
        deploymentState,
        restClient,
        vsUI,
        secretStore,
    );

    const startInstanceSvc = new StartInstanceService(
        vsDocument,
        vsWorkspace,
        restClient,
        vsUI,
        artifactSvc,
    );

    // 4. Public API: selection-change emitter exposed to other extensions.
    const selectionEmitter = new EventEmitter<{ uri: Uri; elementId?: string }>();
    context.subscriptions.push(selectionEmitter);

    // 5. Controllers
    const commandController = new CommandController(editorStore, vsDocument, vsUI, bpmnService);
    new BpmnEditorController(
        editorStore,
        bpmnService,
        diffService,
        artifactSvc,
        vsUI,
        vsDocument,
        statusBar,
        selectionEmitter,
    ).register(context);
    new DmnEditorController(editorStore, dmnService, vsUI).register(context);
    new BpmnCompareController(compareSelection, diffService, vsUI).register(context);
    commandController.register(context);
    new DeploymentController(editorStore, vsDocument, deploymentSvc, startInstanceSvc, vsUI).register(context);

    return {
        onDidChangeSelection: selectionEmitter.event,
    };
}

const RELEASES_BASE = "https://github.com/Miragon/bpmn-modeler/releases/tag";
const LAST_NOTIFIED_KEY = "lastNotifiedVersion";

/**
 * Shows a release-notes notification the first time the extension runs after
 * a version bump. Persists the current version in globalState so the message
 * is displayed exactly once per release.
 *
 * @param context - The VS Code extension context used to read the current
 *   version and persist the last notified version across restarts.
 */
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
