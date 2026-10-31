import { DeploymentFeature, EditorSessionParticipant } from "@miragon/bpmn-modeler-core";

import { RpcDeploymentState, RpcSecretStore } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import {
    DeploymentOpenParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
    DeploymentWorkspaceRootParams,
} from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The deployment feature maps the host's deployment RPC onto the core
 * {@link DeploymentFeature} — the same flows VS Code runs — over the
 * deployment-state mirror and the PasswordSafe-backed secret store. The
 * deployment tool window is the one panel; `post` notifies the host, which
 * pushes the Query into its JCEF browser.
 *
 * RPC (Host → Core): deploymentState/seed, deployment/webviewMessage,
 * deployment/open, deployment/switchTarget, deployment/verify,
 * deployment/statusBarMenu, deployment/deployFiles, deployment/deployActive.
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

    // Seed the deployment-state mirror once at startup (and after a persisted
    // save, if the host chooses to re-seed); `load()` then reads it synchronously.
    deps.rpc.on(METHODS.deploymentStateSeed, (params: DeploymentSeedParams) => {
        deploymentState.seed(params.state);
    });

    // Errors are caught inside each handler, so this never rejects.
    deps.rpc.on(METHODS.deploymentWebviewMessage, (params: DeploymentWebviewMessageParams) => {
        void panel.handle(params.message);
    });

    deps.rpc.on(METHODS.deploymentOpen, (params: DeploymentOpenParams) => {
        panel.setVisible(params.open);
    });

    // The commands can run before any diagram is open, so the host's root
    // stands in for the document directory and is registered for the run.
    async function inWorkspace(
        params: DeploymentWorkspaceRootParams,
        command: (documentDir: string) => Promise<void>,
    ): Promise<void> {
        deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        try {
            await command(deployment.activeDocumentDir() ?? params.workspaceRoot);
        } finally {
            deps.nodeWorkspace.unregisterRoot(params.workspaceRoot);
        }
    }

    deps.rpc.on(METHODS.deploymentSwitchTarget, (params: DeploymentWorkspaceRootParams) =>
        inWorkspace(params, (dir) => deployment.switchTarget(dir)),
    );
    deps.rpc.on(METHODS.deploymentVerify, (params: DeploymentWorkspaceRootParams) =>
        inWorkspace(params, (dir) => deployment.verify(dir)),
    );
    deps.rpc.on(METHODS.deploymentStatusBarMenu, (params: DeploymentWorkspaceRootParams) =>
        inWorkspace(params, (dir) => deployment.statusMenu(dir)),
    );
    deps.rpc.on(METHODS.deploymentDeployFiles, (params: DeploymentWorkspaceRootParams) =>
        inWorkspace(params, (dir) => deployment.deployFiles(dir)),
    );
    deps.rpc.on(METHODS.deploymentDeployActive, (params: DeploymentWorkspaceRootParams) =>
        inWorkspace(params, (dir) => deployment.deployActive(dir)),
    );

    return { statusParticipant: deployment.statusParticipant };
}
