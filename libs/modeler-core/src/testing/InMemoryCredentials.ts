import { SecretStorePort } from "../deployment/domain/ports";
import { TokenPrompt, TokenPromptPort, TokenStorePort } from "../template-marketplace/domain/ports";

interface SlotCredentials {
    basicAuth?: { username: string; password: string };
    oauth2?: { clientId: string; clientSecret: string };
}

const LEGACY_SLOT = Symbol("legacy unnamed slot");

export class InMemorySecretStore implements SecretStorePort {
    private readonly slots = new Map<string | typeof LEGACY_SLOT, SlotCredentials>();
    private readonly approvedDestinations = new Map<string, string[]>();

    async saveBasicAuth(username: string, password: string, slot?: string): Promise<void> {
        this.credentials(slot).basicAuth = { username, password };
    }

    async getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined> {
        return this.slots.get(slot ?? LEGACY_SLOT)?.basicAuth;
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        this.credentials(slot).oauth2 = { clientId, clientSecret };
    }

    async getOAuth2(
        slot?: string,
    ): Promise<{ clientId: string; clientSecret: string } | undefined> {
        return this.slots.get(slot ?? LEGACY_SLOT)?.oauth2;
    }

    async getApprovedDestinations(slot: string): Promise<string[]> {
        return [...(this.approvedDestinations.get(slot) ?? [])];
    }

    async saveApprovedDestinations(slot: string, origins: string[]): Promise<void> {
        this.approvedDestinations.set(slot, [...origins]);
    }

    async delete(slot: string): Promise<void> {
        this.slots.delete(slot);
        this.approvedDestinations.delete(slot);
    }

    private credentials(slot: string | undefined): SlotCredentials {
        const key = slot ?? LEGACY_SLOT;
        const existing = this.slots.get(key);
        if (existing) return existing;
        const created: SlotCredentials = {};
        this.slots.set(key, created);
        return created;
    }
}

export class InMemoryTokenStore implements TokenStorePort {
    readonly tokens = new Map<string, string>();
    readonly reads: string[] = [];

    async getToken(host: string): Promise<string | undefined> {
        this.reads.push(host);
        return this.tokens.get(host);
    }

    async setToken(host: string, token: string): Promise<void> {
        this.tokens.set(host, token);
    }
}

/** Answers per host from `answers` as typed, like a host; an unanswered host is a dismissal. */
export class ScriptedTokenPrompt implements TokenPromptPort {
    readonly prompts: TokenPrompt[] = [];

    constructor(readonly answers: Record<string, string> = {}) {}

    async promptForToken(prompt: TokenPrompt): Promise<string | undefined> {
        this.prompts.push(prompt);
        return this.answers[prompt.host];
    }
}
