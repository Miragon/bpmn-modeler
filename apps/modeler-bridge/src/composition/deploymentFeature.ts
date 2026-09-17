import { posix } from "path";

import {
    AuthHeaderResolver,
    Camunda7RestClient,
    Camunda8RestClient,
    CamundaEngineRouter,
    DeploymentMessageDispatcher,
    DeploymentService,
    DeploymentStatusService,
    DeploymentTargetService,
    FetchHttpClient,
    StartInstanceService,
} from "@miragon/bpmn-modeler-core";

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
 * The deployment feature owns its entire stack: the Camunda 7/8 REST client
 * chain, the deployment-state mirror, the PasswordSafe-backed secret store, the
 * two services, and the message dispatcher. None of it is shared, so the engine
 * router is assembled here. `artifactSvc` (shared with templates/code-link) is
 * the only collaborator pulled from `deps`.
 *
 * RPC (Host → Core): deploymentState/seed, deployment/webviewMessage,
 * deployment/open.
 */
export function register(deps: BridgeSharedDeps): void {
    // Deployment reuses the production deployment brain verbatim: the same
    // services + dispatcher the VS Code host wires, now fed by the host-fed
    // deployment-state mirror and the PasswordSafe-backed secret store over RPC.
    // The Camunda REST stack is pure Node (Buffer/fetch/multipart), so it runs
    // unmodified under Bun. `post` notifies the host, which pushes the Query into
    // the deployment tool-window's JCEF browser.
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const camundaRouter = new CamundaEngineRouter(
        new Camunda7RestClient(httpClient, authResolver),
        new Camunda8RestClient(httpClient, authResolver, deps.settings.getC8ApiVersion()),
    );
    const deploymentState = new RpcDeploymentState(deps.rpc, deps.notifier);
    const secretStore = new RpcSecretStore(deps.rpc);
    const startInstanceService = new StartInstanceService(
        deps.documentPort,
        deps.nodeWorkspace,
        camundaRouter,
        deps.notifier,
        deps.picker,
        deps.artifactSvc,
    );
    const deploymentTargetService = new DeploymentTargetService(
        deps.artifactSvc,
        deps.settings,
        deps.nodeWorkspace,
        secretStore,
        deploymentState,
        deps.picker,
        deps.notifier,
    );
    const deploymentStatusService = new DeploymentStatusService(
        deps.store,
        deps.documentPort,
        deploymentTargetService,
        deploymentState,
        deps.statusBar,
        deps.notifier,
    );
    const deploymentService = new DeploymentService(
        deps.documentPort,
        deps.nodeWorkspace,
        deploymentState,
        camundaRouter,
        deps.notifier,
        deps.picker,
        secretStore,
        deploymentStatusService,
    );
    const deploymentDispatcher = new DeploymentMessageDispatcher(
        deps.store,
        deps.documentPort,
        deploymentService,
        startInstanceService,
        deploymentTargetService,
        deploymentStatusService,
        deps.notifier,
        (message) => deps.rpc.notify(METHODS.deploymentPostMessage, { message }),
    );

    // The form's defaults track the active editor, but only while the panel is
    // open — refreshing a hidden panel would be wasted RPC. The host reports
    // open/close via `deployment/open`.
    let deploymentPanelOpen = false;
    deps.store.onDidChangeActiveEditor(() => {
        if (deploymentPanelOpen) {
            deploymentDispatcher.sendFormDefaults();
        }
        void deploymentStatusService.refreshActive();
    });

    // Keep the freshness dot live on edits. The status-bar widget tracks the
    // focused editor regardless of the deployment panel's visibility, so this
    // refresh is independent of `deploymentPanelOpen`. Debounced so a burst of
    // keystroke-driven syncs collapses into one ledger lookup.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    deps.mirror.onDidChangeContent(() => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void deploymentStatusService.refreshActive();
        }, 300);
    });

    // Seed the deployment-state mirror once at startup (and after a persisted
    // save, if the host chooses to re-seed); getters then read it synchronously.
    deps.rpc.on(METHODS.deploymentStateSeed, (params: DeploymentSeedParams) => {
        deploymentState.seed(params.state);
    });

    // Inbound deployment-webview message → the shared dispatch core. Errors are
    // caught inside each handler, so this never rejects.
    deps.rpc.on(METHODS.deploymentWebviewMessage, (params: DeploymentWebviewMessageParams) => {
        void deploymentDispatcher.handle(params.message);
    });

    // The host reports the tool window's visibility; on open, push the current
    // form defaults so the panel reflects the active diagram immediately.
    deps.rpc.on(METHODS.deploymentOpen, (params: DeploymentOpenParams) => {
        deploymentPanelOpen = params.open;
        if (params.open) {
            deploymentDispatcher.sendFormDefaults();
        }
    });

    async function withDeploymentContext(
        params: DeploymentWorkspaceRootParams,
        action: (documentDir: string) => Promise<void>,
    ): Promise<void> {
        deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        try {
            let documentDir = params.workspaceRoot;
            try {
                documentDir = posix.dirname(
                    deps.documentPort.getFilePath(deps.store.getActiveEditorId()),
                );
            } catch {
                // Commands also work before any diagram is opened.
            }
            await action(documentDir);
        } catch (error) {
            deps.notifier.notifyError(
                "Deployment command failed",
                error instanceof Error ? error : new Error(String(error)),
            );
        } finally {
            deps.nodeWorkspace.unregisterRoot(params.workspaceRoot);
        }
    }

    deps.rpc.on(METHODS.deploymentSwitchTarget, (params: DeploymentWorkspaceRootParams) =>
        withDeploymentContext(params, async (documentDir) => {
            await deploymentTargetService.switchActiveTarget(documentDir);
            await deploymentStatusService.refreshActive();
            await deploymentDispatcher.sendTargets();
        }),
    );

    deps.rpc.on(METHODS.deploymentDeployFiles, (params: DeploymentWorkspaceRootParams) =>
        withDeploymentContext(params, async (documentDir) => {
            let target = await deploymentTargetService.getActiveTarget(documentDir);
            if (target === undefined) {
                await deploymentTargetService.switchActiveTarget(documentDir);
                await deploymentStatusService.refreshActive();
                await deploymentDispatcher.sendTargets();
                target = await deploymentTargetService.getActiveTarget(documentDir);
                if (target === undefined) return;
            }

            const files = await deps.picker.pickWorkspaceFiles({
                glob: "**/*.{bpmn,dmn}",
                exclude: "**/node_modules/**",
                placeholder: `Select files to deploy to "${target.name}"`,
            });
            if (files.length === 0) return;

            const resolvedTarget = target;
            const auth = await deploymentTargetService.getCredentials(resolvedTarget, documentDir);
            await deps.notifier.withProgress(
                `Deploying ${files.length} file(s) to "${resolvedTarget.name}"`,
                () => deploymentService.deployFiles(files, resolvedTarget, auth),
            );
            await deploymentStatusService.refreshActive();
        }),
    );
}
