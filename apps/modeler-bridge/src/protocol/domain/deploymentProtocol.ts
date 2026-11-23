import { DeploymentStatePatch, RawDeploymentState } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";

import { ProtocolEntry } from "./protocolEntry";
import { SAMPLE_COMMAND, SAMPLE_QUERY } from "./sharedSamples";

/**
 * `deploymentState/seed` — the host seeds the deployment-state mirror with what
 * it stored; the core fills in the defaults.
 */
export interface DeploymentSeedParams {
    state: RawDeploymentState;
}

/** `deployment/webviewMessage` — a webview {@link Command} from the deployment panel. */
export interface DeploymentWebviewMessageParams {
    message: Command;
}

/** `deployment/open` — the host reports the deployment tool-window's visibility. */
export interface DeploymentOpenParams {
    open: boolean;
}

/**
 * `deployment/switchTarget`, `deployment/deployFiles`, `deployment/deployActive`,
 * `deployment/verify`, `deployment/statusBarMenu` — host-initiated. The workspace root is passed
 * because `NodeWorkspace` only learns roots from `session/register`, so a host
 * action fired with no active editor must name it.
 */
export interface DeploymentWorkspaceRootParams {
    workspaceRoot: string;
}

/** `secretStore/getBasicAuth` and `secretStore/getOAuth2` results. */
export interface BasicAuthCredentials {
    username: string;
    password: string;
}

/** `secretStore/getOAuth2` result / `secretStore/saveOAuth2` credential half. */
export interface OAuth2Credentials {
    clientId: string;
    clientSecret: string;
}

/**
 * `secretStore/*` params. Every credential call carries an optional `slot`
 * scoping it to a named deployment target (absent = the legacy ad-hoc keys).
 */
export interface SecretSaveBasicAuthParams {
    username: string;
    password: string;
    slot?: string;
}
export interface SecretSaveOAuth2Params {
    clientId: string;
    clientSecret: string;
    slot?: string;
}
export interface SecretGetParams {
    slot?: string;
}
export interface SecretDeleteParams {
    slot: string;
}
export interface SecretGetApprovedDestinationsParams {
    slot: string;
}
/** `secretStore/getApprovedDestinations` result, or `null` when nothing is stored. */
export interface SecretApprovedDestinations {
    origins: string[];
}
export interface SecretSaveApprovedDestinationsParams {
    slot: string;
    origins: string[];
}

/**
 * `deploymentState/save` — persist exactly the fields and ledger rows the patch
 * names; the host acks an empty reply.
 */
export interface DeploymentSaveParams {
    patch: DeploymentStatePatch;
}

/** `deployment/postMessage` — the core pushes a {@link Query} into the deployment panel. */
interface DeploymentPostMessageParams {
    message: Query;
}

export const DEPLOYMENT_METHODS = {
    deploymentStateSeed: "deploymentState/seed",
    deploymentWebviewMessage: "deployment/webviewMessage",
    deploymentOpen: "deployment/open",
    deploymentSwitchTarget: "deployment/switchTarget",
    deploymentDeployFiles: "deployment/deployFiles",
    deploymentDeployActive: "deployment/deployActive",
    deploymentVerify: "deployment/verify",
    deploymentStatusBarMenu: "deployment/statusBarMenu",
    secretStoreSaveBasicAuth: "secretStore/saveBasicAuth",
    secretStoreGetBasicAuth: "secretStore/getBasicAuth",
    secretStoreSaveOAuth2: "secretStore/saveOAuth2",
    secretStoreGetOAuth2: "secretStore/getOAuth2",
    secretStoreGetApprovedDestinations: "secretStore/getApprovedDestinations",
    secretStoreSaveApprovedDestinations: "secretStore/saveApprovedDestinations",
    secretStoreDelete: "secretStore/delete",
    deploymentStateSave: "deploymentState/save",
    deploymentPostMessage: "deployment/postMessage",
} as const;

export const DEPLOYMENT_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: DEPLOYMENT_METHODS.deploymentStateSeed,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { state: {} } satisfies DeploymentSeedParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentWebviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { message: SAMPLE_COMMAND } satisfies DeploymentWebviewMessageParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentOpen,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { open: true } satisfies DeploymentOpenParams,
    },
] as const satisfies readonly ProtocolEntry[];

/** The deployment's IDE actions, sent when the user runs one. */
export const DEPLOYMENT_COMMAND_NOTIFICATIONS = [
    {
        method: DEPLOYMENT_METHODS.deploymentSwitchTarget,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentDeployFiles,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentDeployActive,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentVerify,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
    {
        method: DEPLOYMENT_METHODS.deploymentStatusBarMenu,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies DeploymentWorkspaceRootParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const DEPLOYMENT_CORE_TO_HOST_REQUESTS = [
    {
        method: DEPLOYMENT_METHODS.secretStoreSaveBasicAuth,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            username: "u",
            password: "p",
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretSaveBasicAuthParams,
        // No result: the host acks an empty reply; the core awaits only the round-trip.
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreGetBasicAuth,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetParams,
        resultFixture: { username: "u", password: "p" } satisfies BasicAuthCredentials,
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreSaveOAuth2,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            clientId: "id",
            clientSecret: "secret",
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretSaveOAuth2Params,
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreGetOAuth2,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetParams,
        resultFixture: { clientId: "id", clientSecret: "secret" } satisfies OAuth2Credentials,
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreGetApprovedDestinations,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretGetApprovedDestinationsParams,
        resultFixture: { origins: ["https://engine.example"] } satisfies SecretApprovedDestinations,
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreSaveApprovedDestinations,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
            origins: ["https://engine.example"],
        } satisfies SecretSaveApprovedDestinationsParams,
    },
    {
        method: DEPLOYMENT_METHODS.secretStoreDelete,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            slot: "/ws/.camunda/deployment-targets.json::dev",
        } satisfies SecretDeleteParams,
    },
    // Acknowledged persist (a request, not a notification): the bridge awaits the
    // host's empty ack so a persist failure rejects the core's write instead of
    // diverging silently. No resultFixture (empty ack).
    {
        method: DEPLOYMENT_METHODS.deploymentStateSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            patch: {
                endpoint: "https://engine",
                tenantId: "t1",
                authType: "oauth2",
                tokenEndpoint: "https://token",
                audience: "aud",
                activeTargetName: "dev",
                ledger: {
                    put: {
                        "target:dev@localhost:8080::/work/order.bpmn": {
                            fingerprint: "0123456789abcdef",
                            deployedAt: "2026-09-17T14:32:00.000Z",
                            deploymentId: "dep-1",
                            origin: "engine",
                            verifiedAt: "2026-09-17T15:00:00.000Z",
                        },
                    },
                    remove: ["target:prod@localhost:8080::/work/order.bpmn"],
                },
            },
        } satisfies DeploymentSaveParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const DEPLOYMENT_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: DEPLOYMENT_METHODS.deploymentPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: SAMPLE_QUERY } satisfies DeploymentPostMessageParams,
    },
] as const satisfies readonly ProtocolEntry[];
