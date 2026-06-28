import {
    AuthHeaderResolver,
    Camunda7RestClient,
    Camunda8RestClient,
    CamundaEngineRouter,
    DeploymentMessageDispatcher,
    DeploymentService,
    FetchHttpClient,
    StartInstanceService,
} from "@miragon/bpmn-modeler-core";

import { RpcDeploymentState, RpcSecretStore } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import {
    DeploymentOpenParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
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
    const deploymentService = new DeploymentService(
        deps.documentPort,
        deps.nodeWorkspace,
        deploymentState,
        camundaRouter,
        deps.notifier,
        deps.picker,
        secretStore,
    );
    const startInstanceService = new StartInstanceService(
        deps.documentPort,
        deps.nodeWorkspace,
        camundaRouter,
        deps.notifier,
        deps.picker,
        deps.artifactSvc,
    );
    const deploymentDispatcher = new DeploymentMessageDispatcher(
        deps.store,
        deps.documentPort,
        deploymentService,
        startInstanceService,
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
}
