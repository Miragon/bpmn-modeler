import { env, ExtensionContext, Uri, window } from "vscode";

import { setContext } from "./infrastructure/extensionContext";

import { EditorStore } from "./infrastructure/EditorStore";
import { VsCodeDocument } from "./infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "./infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeUI } from "./infrastructure/VsCodeUI";
import { VsCodeFileResolver } from "./infrastructure/VsCodeFileResolver";
import { VsCodeMapPersistence } from "./infrastructure/VsCodeMapPersistence";
import { ArtifactService } from "./service/ArtifactService";
import { BpmnModelerService } from "./service/BpmnModelerService";
import { DmnModelerService } from "./service/DmnModelerService";
import { ImplementationMapService } from "./service/ImplementationMapService";
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
 * Instantiation order:
 * 1. Infrastructure (EditorStore, VsCodeDocument, VsCodeWorkspace, VsCodeSettings, VsCodeUI,
 *    VsCodeDeploymentState, CamundaRestClient)
 * 2. Services (ArtifactService, BpmnModelerService, DmnModelerService, DeploymentService)
 * 3. Controllers (CommandController, BpmnEditorController, DmnEditorController, DeploymentController)
 */
export function activate(context: ExtensionContext): void {
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
    const vsUI = new VsCodeUI();
    const deploymentState = new VsCodeDeploymentState();
    const secretStore = new VsCodeSecretStore();
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const c7Client = new Camunda7RestClient(httpClient, authResolver);
    const c8Client = new Camunda8RestClient(httpClient, authResolver, vsSettings.getC8ApiVersion());
    const restClient = new CamundaEngineRouter(c7Client, c8Client);

    // 3. Services
    const fileResolver = new VsCodeFileResolver();
    const mapPersistence = new VsCodeMapPersistence();
    const artifactSvc = new ArtifactService(vsWorkspace, vsSettings);
    const bpmnService = new BpmnModelerService(
        editorStore,
        vsDocument,
        vsSettings,
        vsUI,
        artifactSvc,
    );
    const dmnService = new DmnModelerService(editorStore, vsDocument, vsUI);
    const implMapSvc = new ImplementationMapService(
        editorStore,
        fileResolver,
        vsUI,
        mapPersistence,
        artifactSvc,
        vsSettings,
    );
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

    // 4. Controllers
    const commandController = new CommandController(editorStore, vsDocument, vsUI);
    new BpmnEditorController(
        editorStore,
        bpmnService,
        artifactSvc,
        vsUI,
        implMapSvc,
    ).register(context);
    new DmnEditorController(editorStore, dmnService, vsUI).register(context);
    commandController.register(context);
    new DeploymentController(editorStore, vsDocument, deploymentSvc, startInstanceSvc, vsUI).register(context);
}

const RELEASES_BASE = "https://github.com/Miragon/bpmn-vscode-modeler/releases/tag";
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
            `Camunda Modeler updated to v${current}. See what's new!`,
            "View Release Notes",
        )
        .then((selection) => {
            if (selection === "View Release Notes") {
                env.openExternal(Uri.parse(`${RELEASES_BASE}/v${current}`));
            }
        });
}
