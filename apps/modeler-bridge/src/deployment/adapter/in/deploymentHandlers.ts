import { DeploymentFeature, DeploymentPanel } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import {
    DeploymentOpenParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
    DeploymentWorkspaceRootParams,
} from "../../../protocol/domain/types";
import { WorkspaceRoots } from "../../../kernel/port/WorkspaceRoots";
import { DeploymentStateMirror } from "../../port/DeploymentStateMirror";

/**
 * RPC (Host → Core): deploymentState/seed, deployment/webviewMessage,
 * deployment/open, deployment/switchTarget, deployment/verify,
 * deployment/statusBarMenu, deployment/deployFiles, deployment/deployActive.
 */
export function deploymentHandlers({
    deployment,
    panel,
    stateMirror,
    workspaceRoots,
}: {
    deployment: DeploymentFeature;
    panel: DeploymentPanel;
    stateMirror: DeploymentStateMirror;
    workspaceRoots: WorkspaceRoots;
}): RpcHandlerTable {
    // The commands can run before any diagram is open, so the host's root
    // stands in for the document directory and is registered for the run.
    async function inWorkspace(
        params: DeploymentWorkspaceRootParams,
        command: (documentDir: string) => Promise<void>,
    ): Promise<void> {
        workspaceRoots.registerRoot(params.workspaceRoot);
        try {
            await command(deployment.activeDocumentDir() ?? params.workspaceRoot);
        } finally {
            workspaceRoots.unregisterRoot(params.workspaceRoot);
        }
    }

    return {
        // Seed the deployment-state mirror once at startup (and after a persisted
        // save, if the host chooses to re-seed); `load()` then reads it synchronously.
        [METHODS.deploymentStateSeed]: (params: DeploymentSeedParams) => {
            stateMirror.seed(params.state);
        },
        // Errors are caught inside each handler, so this never rejects.
        [METHODS.deploymentWebviewMessage]: (params: DeploymentWebviewMessageParams) => {
            void panel.handle(params.message);
        },
        [METHODS.deploymentOpen]: (params: DeploymentOpenParams) => {
            panel.setVisible(params.open);
        },
        [METHODS.deploymentSwitchTarget]: (params: DeploymentWorkspaceRootParams) =>
            inWorkspace(params, (dir) => deployment.switchTarget(dir)),
        [METHODS.deploymentVerify]: (params: DeploymentWorkspaceRootParams) =>
            inWorkspace(params, (dir) => deployment.verify(dir)),
        [METHODS.deploymentStatusBarMenu]: (params: DeploymentWorkspaceRootParams) =>
            inWorkspace(params, (dir) => deployment.statusMenu(dir)),
        [METHODS.deploymentDeployFiles]: (params: DeploymentWorkspaceRootParams) =>
            inWorkspace(params, (dir) => deployment.deployFiles(dir)),
        [METHODS.deploymentDeployActive]: (params: DeploymentWorkspaceRootParams) =>
            inWorkspace(params, (dir) => deployment.deployActive(dir)),
    };
}
