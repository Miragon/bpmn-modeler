import { getContext } from "./extensionContext";

/** Key prefix for secrets stored in VS Code's SecretStorage. */
const SECRET_PREFIX = "bpmn-modeler.deployment";

/**
 * Adapter over VS Code's {@link SecretStorage} for persisting sensitive
 * deployment credentials (e.g. Basic Auth username/password).
 *
 * Secrets are encrypted at rest by VS Code and are never written to
 * workspace state or settings files.
 */
export class VsCodeSecretStore {
    /**
     * Persists Basic Auth credentials in VS Code's secret storage.
     *
     * @param username The Basic Auth username.
     * @param password The Basic Auth password.
     */
    async saveBasicAuth(username: string, password: string): Promise<void> {
        const secrets = getContext().secrets;
        await secrets.store(`${SECRET_PREFIX}.basicUsername`, username);
        await secrets.store(`${SECRET_PREFIX}.basicPassword`, password);
    }

    /**
     * Retrieves previously stored Basic Auth credentials.
     *
     * @returns An object with `username` and `password`, or `undefined` if
     *   no credentials have been stored yet.
     */
    async getBasicAuth(): Promise<{ username: string; password: string } | undefined> {
        const secrets = getContext().secrets;
        const username = await secrets.get(`${SECRET_PREFIX}.basicUsername`);
        const password = await secrets.get(`${SECRET_PREFIX}.basicPassword`);

        if (username === undefined || password === undefined) {
            return undefined;
        }

        return { username, password };
    }

    /**
     * Persists OAuth2 client credentials in VS Code's secret storage.
     *
     * @param clientId The OAuth2 client identifier.
     * @param clientSecret The OAuth2 client secret.
     */
    async saveOAuth2(clientId: string, clientSecret: string): Promise<void> {
        const secrets = getContext().secrets;
        await secrets.store(`${SECRET_PREFIX}.oauth2ClientId`, clientId);
        await secrets.store(`${SECRET_PREFIX}.oauth2ClientSecret`, clientSecret);
    }

    /**
     * Retrieves previously stored OAuth2 client credentials.
     *
     * @returns An object with `clientId` and `clientSecret`, or `undefined` if
     *   no credentials have been stored yet.
     */
    async getOAuth2(): Promise<{ clientId: string; clientSecret: string } | undefined> {
        const secrets = getContext().secrets;
        const clientId = await secrets.get(`${SECRET_PREFIX}.oauth2ClientId`);
        const clientSecret = await secrets.get(`${SECRET_PREFIX}.oauth2ClientSecret`);

        if (clientId === undefined || clientSecret === undefined) {
            return undefined;
        }

        return { clientId, clientSecret };
    }
}
