import { ExtensionContext } from "vscode";

import { VsCodeDeploymentState } from "../deployment/infrastructure/VsCodeDeploymentState";
import { VsCodeSecretStore } from "../deployment/infrastructure/VsCodeSecretStore";
import {
    AuthHeaderResolver,
    Camunda7RestClient,
    Camunda8RestClient,
    CamundaEngineRouter,
    DeploymentService,
    DeploymentStatusService,
    DeploymentTargetService,
    DeploymentVerificationService,
    FetchHttpClient,
    StartInstanceService,
} from "@miragon/bpmn-modeler-core";
import { DeploymentController } from "../deployment/controller/DeploymentController";
import { DeploymentStatusParticipant } from "../deployment/controller/editor-participants/DeploymentStatusParticipant";
import { SharedDeps } from "./sharedDeps";

/**
 * Lifecycle-bearing collaborator the editor feature routes into: the deployment
 * status participant shows the active target and freshness dot while a BPMN panel
 * is focused. Returned (not registered here) because the editor session owns the
 * participant lifecycle, mirroring the code-link participant hand-off.
 */
export interface DeploymentHandles {
    deploymentStatusParticipant: DeploymentStatusParticipant;
}

/**
 * The deployment feature owns its entire stack: deployment state, secret store,
 * the target service, and the whole Camunda 7/8 client chain. None of it is
 * shared, so the engine router is assembled here rather than in `activate`.
 * `artifactSvc` (shared with the editor feature) is the only collaborator pulled
 * from `deps`.
 */
export function register(context: ExtensionContext, deps: SharedDeps): DeploymentHandles {
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

    const startInstanceSvc = new StartInstanceService(
        deps.vsDocument,
        deps.vsWorkspace,
        restClient,
        deps.notifier,
        deps.picker,
        deps.artifactSvc,
    );
    const deploymentTargetSvc = new DeploymentTargetService(
        deps.artifactSvc,
        deps.vsSettings,
        deps.vsWorkspace,
        secretStore,
        deploymentState,
        deps.picker,
        deps.notifier,
    );
    const deploymentStatusSvc = new DeploymentStatusService(
        deps.editorStore,
        deps.vsDocument,
        deploymentTargetSvc,
        deploymentState,
        deps.statusBar,
        deps.picker,
        deps.notifier,
    );
    const verificationSvc = new DeploymentVerificationService(
        deps.editorStore,
        deps.vsDocument,
        deploymentTargetSvc,
        deploymentStatusSvc,
        c7Client,
        deps.notifier,
    );
    const deploymentSvc = new DeploymentService(
        deps.vsDocument,
        deps.vsWorkspace,
        deploymentState,
        restClient,
        deps.notifier,
        deps.picker,
        secretStore,
        deploymentStatusSvc,
    );

    new DeploymentController(
        deps.editorStore,
        deps.vsDocument,
        deploymentSvc,
        startInstanceSvc,
        deploymentTargetSvc,
        deploymentStatusSvc,
        verificationSvc,
        deps.picker,
        deps.notifier,
    ).register(context);

    return {
        deploymentStatusParticipant: new DeploymentStatusParticipant(deploymentStatusSvc),
    };
}
