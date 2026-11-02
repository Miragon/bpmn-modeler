import { DeploymentFeature, EditorSessionParticipant } from "@miragon/bpmn-modeler-core";

import { RpcDeploymentState } from "../deployment/adapter/out/RpcDeploymentState";
import { RpcSecretStore } from "../deployment/adapter/out/RpcSecretStore";
import { METHODS } from "../protocol/domain/descriptor";
import { deploymentHandlers } from "../deployment/adapter/in/deploymentHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The deployment feature maps the host's deployment RPC onto the core
 * {@link DeploymentFeature} — the same flows VS Code runs — over the
 * deployment-state mirror and the PasswordSafe-backed secret store. The
 * deployment tool window is the one panel; `post` notifies the host, which
 * pushes the Query into its JCEF browser.
 */
export function register(deps: BridgeSharedDeps): { statusParticipant: EditorSessionParticipant } {
    const deploymentState = new RpcDeploymentState(deps.rpc);
    const deployment = new DeploymentFeature({
        store: deps.store,
        documents: deps.documentPort,
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        picker: deps.picker,
        statusBar: deps.statusBar,
        artifacts: deps.artifactSvc,
        secrets: new RpcSecretStore(deps.rpc),
        state: deploymentState,
        pendingEdits: deps.pendingEdits,
    });
    // Refreshing a hidden tool window would be wasted RPC; the host reports
    // open/close via `deployment/open`.
    const panel = deployment.attachPanel(
        (message) => deps.rpc.notify(METHODS.deploymentPostMessage, { message }),
        false,
    );

    bindHandlers(
        deps.rpc,
        deploymentHandlers({
            deployment,
            panel,
            stateMirror: deploymentState,
            workspaceRoots: deps.nodeWorkspace,
        }),
    );

    return { statusParticipant: deployment.statusParticipant };
}
