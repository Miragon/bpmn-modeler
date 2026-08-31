import { AuthTypePayload } from "@miragon/bpmn-modeler-shared";

import { DeploymentStatePort } from "@miragon/bpmn-modeler-core";

import { getContext } from "../../shared/infrastructure/extensionContext";

/**
 * Persists deployment form state (endpoint, tenantId, authType, OAuth2 config)
 * across VS Code sessions in the extension's `workspaceState`.
 */
export class VsCodeDeploymentState implements DeploymentStatePort {
    private static readonly ENDPOINT_KEY = "bpmn-modeler.deployment.endpoint";

    private static readonly TENANT_ID_KEY = "bpmn-modeler.deployment.tenantId";

    private static readonly AUTH_TYPE_KEY = "bpmn-modeler.deployment.authType";

    private static readonly TOKEN_ENDPOINT_KEY = "bpmn-modeler.deployment.tokenEndpoint";

    private static readonly AUDIENCE_KEY = "bpmn-modeler.deployment.audience";

    getEndpoint(): string {
        return getContext().workspaceState.get<string>(VsCodeDeploymentState.ENDPOINT_KEY, "");
    }

    getTenantId(): string {
        return getContext().workspaceState.get<string>(VsCodeDeploymentState.TENANT_ID_KEY, "");
    }

    getAuthType(): AuthTypePayload {
        return getContext().workspaceState.get<AuthTypePayload>(
            VsCodeDeploymentState.AUTH_TYPE_KEY,
            "none",
        );
    }

    async saveAuthType(authType: AuthTypePayload): Promise<void> {
        await getContext().workspaceState.update(VsCodeDeploymentState.AUTH_TYPE_KEY, authType);
    }

    getTokenEndpoint(): string {
        return getContext().workspaceState.get<string>(
            VsCodeDeploymentState.TOKEN_ENDPOINT_KEY,
            "",
        );
    }

    getAudience(): string {
        return getContext().workspaceState.get<string>(VsCodeDeploymentState.AUDIENCE_KEY, "");
    }

    async saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void> {
        await getContext().workspaceState.update(
            VsCodeDeploymentState.TOKEN_ENDPOINT_KEY,
            tokenEndpoint,
        );
        await getContext().workspaceState.update(VsCodeDeploymentState.AUDIENCE_KEY, audience);
    }

    async save(endpoint: string, tenantId: string): Promise<void> {
        await getContext().workspaceState.update(VsCodeDeploymentState.ENDPOINT_KEY, endpoint);
        await getContext().workspaceState.update(VsCodeDeploymentState.TENANT_ID_KEY, tenantId);
    }
}
