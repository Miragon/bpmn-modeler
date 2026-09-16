import { SecretStorePort } from "@miragon/bpmn-modeler-core";

import { getContext } from "../../shared/infrastructure/extensionContext";

// Key prefix for secrets stored in VS Code's SecretStorage.
const SECRET_PREFIX = "bpmn-modeler.deployment";

/**
 * Adapter over VS Code's {@link SecretStorage} for persisting sensitive
 * deployment credentials (e.g. Basic Auth username/password).
 *
 * Secrets are encrypted at rest by VS Code and are never written to
 * workspace state or settings files. A `slot` scopes the keys to a named
 * deployment target; `undefined` addresses the legacy unnamed (ad-hoc) keys.
 */
export class VsCodeSecretStore implements SecretStorePort {
    async saveBasicAuth(username: string, password: string, slot?: string): Promise<void> {
        const secrets = getContext().secrets;
        await secrets.store(this.key("basicUsername", slot), username);
        await secrets.store(this.key("basicPassword", slot), password);
    }

    async getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined> {
        const secrets = getContext().secrets;
        const username = await secrets.get(this.key("basicUsername", slot));
        const password = await secrets.get(this.key("basicPassword", slot));

        if (username === undefined || password === undefined) {
            return undefined;
        }

        return { username, password };
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        const secrets = getContext().secrets;
        await secrets.store(this.key("oauth2ClientId", slot), clientId);
        await secrets.store(this.key("oauth2ClientSecret", slot), clientSecret);
    }

    async getOAuth2(
        slot?: string,
    ): Promise<{ clientId: string; clientSecret: string } | undefined> {
        const secrets = getContext().secrets;
        const clientId = await secrets.get(this.key("oauth2ClientId", slot));
        const clientSecret = await secrets.get(this.key("oauth2ClientSecret", slot));

        if (clientId === undefined || clientSecret === undefined) {
            return undefined;
        }

        return { clientId, clientSecret };
    }

    async delete(slot: string): Promise<void> {
        const secrets = getContext().secrets;
        await secrets.delete(this.key("basicUsername", slot));
        await secrets.delete(this.key("basicPassword", slot));
        await secrets.delete(this.key("oauth2ClientId", slot));
        await secrets.delete(this.key("oauth2ClientSecret", slot));
    }

    private key(field: string, slot?: string): string {
        return slot === undefined
            ? `${SECRET_PREFIX}.${field}`
            : `${SECRET_PREFIX}.${slot}.${field}`;
    }
}
