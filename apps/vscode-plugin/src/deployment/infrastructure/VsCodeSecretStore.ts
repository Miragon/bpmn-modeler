import { SecretStorage } from "vscode";

import { SecretStorePort } from "@miragon/bpmn-modeler-core";

// Key prefix for secrets stored in VS Code's SecretStorage.
const SECRET_PREFIX = "bpmn-modeler.deployment";

const APPROVED_DESTINATIONS = "approvedDestinations";

/**
 * One auth type's credential pair, stored as one JSON entry so a write replaces
 * both halves or neither. Earlier releases kept each half under a `legacyKeys`
 * entry of its own.
 */
interface CredentialPairLayout<Field extends string> {
    readonly key: string;
    readonly fields: readonly [Field, Field];
    readonly legacyKeys: readonly [string, string];
}

type CredentialPair<Field extends string> = Record<Field, string>;

const BASIC_AUTH: CredentialPairLayout<"username" | "password"> = {
    key: "basicAuth",
    fields: ["username", "password"],
    legacyKeys: ["basicUsername", "basicPassword"],
};

const OAUTH2: CredentialPairLayout<"clientId" | "clientSecret"> = {
    key: "oauth2",
    fields: ["clientId", "clientSecret"],
    legacyKeys: ["oauth2ClientId", "oauth2ClientSecret"],
};

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
        await this.savePair(BASIC_AUTH, { username, password }, slot);
    }

    async getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined> {
        return this.getPair(BASIC_AUTH, slot);
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        await this.savePair(OAUTH2, { clientId, clientSecret }, slot);
    }

    async getOAuth2(
        slot?: string,
    ): Promise<{ clientId: string; clientSecret: string } | undefined> {
        return this.getPair(OAUTH2, slot);
    }

    async getApprovedDestinations(slot: string): Promise<string[]> {
        const stored = await this.secrets.get(this.key(APPROVED_DESTINATIONS, slot));
        return parseOrigins(stored);
    }

    async saveApprovedDestinations(slot: string, origins: string[]): Promise<void> {
        await this.secrets.store(this.key(APPROVED_DESTINATIONS, slot), JSON.stringify(origins));
    }

    async delete(slot: string): Promise<void> {
        await this.deleteEach([
            ...this.pairKeys(BASIC_AUTH, slot),
            ...this.pairKeys(OAUTH2, slot),
            this.key(APPROVED_DESTINATIONS, slot),
        ]);
    }

    /**
     * The legacy halves go only once the pair is stored, so a failed write leaves
     * the old pair readable. Once it is stored the save has succeeded: the entry
     * shadows any half left behind, and the next save or the slot's delete
     * removes it.
     */
    private async savePair<Field extends string>(
        layout: CredentialPairLayout<Field>,
        pair: CredentialPair<Field>,
        slot: string | undefined,
    ): Promise<void> {
        await this.secrets.store(this.key(layout.key, slot), JSON.stringify(pair));
        await this.deleteEach(
            layout.legacyKeys.map((legacyKey) => this.key(legacyKey, slot)),
        ).catch(() => undefined);
    }

    /** The legacy halves count only while no pair entry exists; a corrupt entry reads as none. */
    private async getPair<Field extends string>(
        layout: CredentialPairLayout<Field>,
        slot: string | undefined,
    ): Promise<CredentialPair<Field> | undefined> {
        const stored = await this.secrets.get(this.key(layout.key, slot));
        if (stored !== undefined) {
            return parsePair(stored, layout.fields);
        }
        const [firstKey, secondKey] = layout.legacyKeys;
        return pairOf(layout.fields, [
            await this.secrets.get(this.key(firstKey, slot)),
            await this.secrets.get(this.key(secondKey, slot)),
        ]);
    }

    private pairKeys<Field extends string>(
        layout: CredentialPairLayout<Field>,
        slot: string,
    ): string[] {
        return [layout.key, ...layout.legacyKeys].map((field) => this.key(field, slot));
    }

    /** Tries every key before reporting the first failure, so one failure leaves no other key behind. */
    private async deleteEach(keys: readonly string[]): Promise<void> {
        const failures: unknown[] = [];
        for (const key of keys) {
            try {
                await this.secrets.delete(key);
            } catch (error) {
                failures.push(error);
            }
        }
        if (failures.length > 0) {
            throw failures[0];
        }
    }

    private key(field: string, slot?: string): string {
        return slot === undefined
            ? `${SECRET_PREFIX}.${field}`
            : `${SECRET_PREFIX}.${slot}.${field}`;
    }
}

function parsePair<Field extends string>(
    stored: string,
    fields: readonly [Field, Field],
): CredentialPair<Field> | undefined {
    const parsed = parseJson(stored);
    if (typeof parsed !== "object" || parsed === null) {
        return undefined;
    }
    const entry = parsed as Partial<Record<Field, unknown>>;
    return pairOf(fields, [entry[fields[0]], entry[fields[1]]]);
}

function pairOf<Field extends string>(
    fields: readonly [Field, Field],
    [first, second]: readonly [unknown, unknown],
): CredentialPair<Field> | undefined {
    if (typeof first !== "string" || typeof second !== "string") {
        return undefined;
    }
    return { [fields[0]]: first, [fields[1]]: second } as CredentialPair<Field>;
}

/** A corrupt entry approves nothing, so the next request asks again. */
function parseOrigins(stored: string | undefined): string[] {
    const parsed = stored === undefined ? undefined : parseJson(stored);
    return Array.isArray(parsed) && parsed.every((origin) => typeof origin === "string")
        ? parsed
        : [];
}

function parseJson(stored: string): unknown {
    try {
        return JSON.parse(stored) as unknown;
    } catch {
        return undefined;
    }
}
