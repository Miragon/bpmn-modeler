import { ProtocolEntry } from "./protocolEntry";
import { SAMPLE_COMMAND, SAMPLE_QUERY } from "./sharedSamples";
import {
    BasicAuthCredentials,
    DeploymentOpenParams,
    DeploymentPostMessageParams,
    DeploymentSaveParams,
    DeploymentSeedParams,
    DeploymentWebviewMessageParams,
    DeploymentWorkspaceRootParams,
    OAuth2Credentials,
    SecretApprovedDestinations,
    SecretDeleteParams,
    SecretGetApprovedDestinationsParams,
    SecretGetParams,
    SecretSaveApprovedDestinationsParams,
    SecretSaveBasicAuthParams,
    SecretSaveOAuth2Params,
} from "./types";

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
