import { AuthTypePayload } from "@miragon/bpmn-modeler-shared";

import { getContext } from "./extensionContext";

/**
 * Persists and restores deployment form state (endpoint, tenantId, authType)
 * between VS Code sessions using the extension's `workspaceState` storage.
 *
 * Uses `getContext()` to access the `ExtensionContext` that was registered in `main.ts`
 * via `setContext()`.
 */
export class VsCodeDeploymentState {
    private static readonly ENDPOINT_KEY = "bpmn-modeler.deployment.endpoint";

    private static readonly TENANT_ID_KEY = "bpmn-modeler.deployment.tenantId";

    private static readonly AUTH_TYPE_KEY = "bpmn-modeler.deployment.authType";

    private static readonly TOKEN_ENDPOINT_KEY = "bpmn-modeler.deployment.tokenEndpoint";

    private static readonly AUDIENCE_KEY = "bpmn-modeler.deployment.audience";

    /**
     * Returns the last-used REST endpoint URL.
     *
     * @returns The persisted endpoint, or an empty string if none has been saved.
     */
    getEndpoint(): string {
        return getContext().workspaceState.get<string>(
            VsCodeDeploymentState.ENDPOINT_KEY,
            "",
        );
    }

    /**
     * Returns the last-used tenant ID.
     *
     * @returns The persisted tenant ID, or an empty string if none has been saved.
     */
    getTenantId(): string {
        return getContext().workspaceState.get<string>(
            VsCodeDeploymentState.TENANT_ID_KEY,
            "",
        );
    }

    /**
     * Returns the last-used authentication type.
     *
     * @returns The persisted auth type, or `"none"` if none has been saved.
     */
    getAuthType(): AuthTypePayload {
        return getContext().workspaceState.get<AuthTypePayload>(
            VsCodeDeploymentState.AUTH_TYPE_KEY,
            "none",
        );
    }

    /**
     * Persists the auth type in workspace state.
     *
     * @param authType The authentication type to persist.
     */
    async saveAuthType(authType: AuthTypePayload): Promise<void> {
        await getContext().workspaceState.update(
            VsCodeDeploymentState.AUTH_TYPE_KEY,
            authType,
        );
    }

    /**
     * Persists the endpoint and tenantId after a successful deployment so they
     * can be pre-filled on the next use.
     *
     * @param endpoint The REST endpoint URL to persist.
     * @param tenantId The tenant ID to persist.
     */
    /**
     * Returns the last-used OAuth2 token endpoint URL.
     *
     * @returns The persisted token endpoint, or an empty string if none has been saved.
     */
    getTokenEndpoint(): string {
        return getContext().workspaceState.get<string>(
            VsCodeDeploymentState.TOKEN_ENDPOINT_KEY,
            "",
        );
    }

    /**
     * Returns the last-used OAuth2 audience.
     *
     * @returns The persisted audience, or an empty string if none has been saved.
     */
    getAudience(): string {
        return getContext().workspaceState.get<string>(
            VsCodeDeploymentState.AUDIENCE_KEY,
            "",
        );
    }

    /**
     * Persists OAuth2-specific non-secret configuration in workspace state.
     *
     * @param tokenEndpoint The token endpoint URL.
     * @param audience The target audience.
     */
    async saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void> {
        await getContext().workspaceState.update(
            VsCodeDeploymentState.TOKEN_ENDPOINT_KEY,
            tokenEndpoint,
        );
        await getContext().workspaceState.update(
            VsCodeDeploymentState.AUDIENCE_KEY,
            audience,
        );
    }

    async save(endpoint: string, tenantId: string): Promise<void> {
        await getContext().workspaceState.update(
            VsCodeDeploymentState.ENDPOINT_KEY,
            endpoint,
        );
        await getContext().workspaceState.update(
            VsCodeDeploymentState.TENANT_ID_KEY,
            tenantId,
        );
    }
}
