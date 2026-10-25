import { ExtensionContext } from "vscode";

import { DeploymentFeature, DeploymentStatusParticipant } from "@miragon/bpmn-modeler-core";
import { VsCodeDeploymentState } from "../deployment/infrastructure/VsCodeDeploymentState";
import { VsCodeSecretStore } from "../deployment/infrastructure/VsCodeSecretStore";
import { DeploymentController } from "../deployment/controller/DeploymentController";
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
 * The deployment feature owns its host state: the workspace-scoped form state
 * and the secret store. Everything else is the core {@link DeploymentFeature}.
 */
export function register(context: ExtensionContext, deps: SharedDeps): DeploymentHandles {
    const deployment = new DeploymentFeature({
        store: deps.editorStore,
        documents: deps.vsDocument,
        workspace: deps.vsWorkspace,
        settings: deps.vsSettings,
        notifier: deps.notifier,
        picker: deps.picker,
        statusBar: deps.statusBar,
        artifacts: deps.artifactSvc,
        secrets: new VsCodeSecretStore(context.secrets),
        state: new VsCodeDeploymentState(context.workspaceState),
    });
    new DeploymentController(deployment).register(context);

    return { deploymentStatusParticipant: deployment.statusParticipant };
}
