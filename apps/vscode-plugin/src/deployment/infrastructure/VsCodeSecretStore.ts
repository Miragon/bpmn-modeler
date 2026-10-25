import { SecretStorage } from "vscode";

import { SecretStorePort } from "@miragon/bpmn-modeler-core";

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
    constructor(private readonly secrets: SecretStorage) {}

    async saveBasicAuth(username: string, password: string, slot?: string): Promise<void> {
        await this.secrets.store(this.key("basicUsername", slot), username);
        await this.secrets.store(this.key("basicPassword", slot), password);
    }

    async getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined> {
        const username = await this.secrets.get(this.key("basicUsername", slot));
        const password = await this.secrets.get(this.key("basicPassword", slot));

        if (username === undefined || password === undefined) {
            return undefined;
        }

        return { username, password };
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        await this.secrets.store(this.key("oauth2ClientId", slot), clientId);
        await this.secrets.store(this.key("oauth2ClientSecret", slot), clientSecret);
    }

    async getOAuth2(
        slot?: string,
    ): Promise<{ clientId: string; clientSecret: string } | undefined> {
        const clientId = await this.secrets.get(this.key("oauth2ClientId", slot));
        const clientSecret = await this.secrets.get(this.key("oauth2ClientSecret", slot));

        if (clientId === undefined || clientSecret === undefined) {
            return undefined;
        }

        return { clientId, clientSecret };
    }

    async getApprovedDestinations(slot: string): Promise<string[]> {
        const stored = await this.secrets.get(this.key("approvedDestinations", slot));
        return parseOrigins(stored);
    }

    async saveApprovedDestinations(slot: string, origins: string[]): Promise<void> {
        await this.secrets.store(this.key("approvedDestinations", slot), JSON.stringify(origins));
    }

    async delete(slot: string): Promise<void> {
        await this.secrets.delete(this.key("basicUsername", slot));
        await this.secrets.delete(this.key("basicPassword", slot));
        await this.secrets.delete(this.key("oauth2ClientId", slot));
        await this.secrets.delete(this.key("oauth2ClientSecret", slot));
        await this.secrets.delete(this.key("approvedDestinations", slot));
    }

    private key(field: string, slot?: string): string {
        return slot === undefined
            ? `${SECRET_PREFIX}.${field}`
            : `${SECRET_PREFIX}.${slot}.${field}`;
    }
}

/** A corrupt entry approves nothing, so the next request asks again. */
function parseOrigins(stored: string | undefined): string[] {
    if (stored === undefined) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(stored);
        return Array.isArray(parsed) && parsed.every((origin) => typeof origin === "string")
            ? parsed
            : [];
    } catch {
        return [];
    }
}
