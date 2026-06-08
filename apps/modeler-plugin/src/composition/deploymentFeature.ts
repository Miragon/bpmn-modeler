import { ExtensionContext } from "vscode";

import { VsCodeDeploymentState } from "../deployment/infrastructure/VsCodeDeploymentState";
import { VsCodeSecretStore } from "../deployment/infrastructure/VsCodeSecretStore";
import { FetchHttpClient } from "../deployment/infrastructure/FetchHttpClient";
import { AuthHeaderResolver } from "../deployment/infrastructure/camunda/AuthHeaderResolver";
import { Camunda7RestClient } from "../deployment/infrastructure/camunda/Camunda7RestClient";
import { Camunda8RestClient } from "../deployment/infrastructure/camunda/Camunda8RestClient";
import { CamundaEngineRouter } from "../deployment/infrastructure/camunda/CamundaEngineRouter";
import { DeploymentService } from "@miragon/bpmn-modeler-core";
import { StartInstanceService } from "@miragon/bpmn-modeler-core";
import { DeploymentController } from "../deployment/controller/DeploymentController";
import { SharedDeps } from "./sharedDeps";

/**
 * The deployment feature owns its entire stack: deployment state, secret store,
 * and the whole Camunda 7/8 client chain. None of it is shared, so the engine
 * router is assembled here rather than in `activate`. `artifactSvc` (shared with
 * the editor feature) is the only collaborator pulled from `deps`.
 */
export function register(context: ExtensionContext, deps: SharedDeps): void {
    const deploymentState = new VsCodeDeploymentState();
    const secretStore = new VsCodeSecretStore();
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const c7Client = new Camunda7RestClient(httpClient, authResolver);
    const c8Client = new Camunda8RestClient(
        httpClient,
        authResolver,
        deps.vsSettings.getC8ApiVersion(),
    );
    const restClient = new CamundaEngineRouter(c7Client, c8Client);

    const deploymentSvc = new DeploymentService(
        deps.vsDocument,
        deps.vsWorkspace,
        deploymentState,
        restClient,
        deps.notifier,
        deps.picker,
        secretStore,
    );
    const startInstanceSvc = new StartInstanceService(
        deps.vsDocument,
        deps.vsWorkspace,
        restClient,
        deps.notifier,
        deps.picker,
        deps.artifactSvc,
    );

    new DeploymentController(
        deps.editorStore,
        deps.vsDocument,
        deploymentSvc,
        startInstanceSvc,
        deps.notifier,
    ).register(context);
}
