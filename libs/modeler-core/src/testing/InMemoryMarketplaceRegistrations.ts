import { MarketplaceSettingsEntry } from "../kernel/domain/modelerSettings";
import {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
} from "../template-marketplace/domain/marketplacePrompts";
import {
    MarketplaceRegistrations,
    MarketplaceScope,
    RegisteredMarketplace,
    SettingsPlace,
    WritableScope,
} from "../template-marketplace/domain/marketplaceRegistrations";
import {
    MarketplacePromptPort,
    MarketplaceRegistrationsPort,
} from "../template-marketplace/port/marketplacePorts";
import { InMemorySettings } from "./InMemorySettings";

const BOTH_SCOPES: readonly WritableScope[] = [
    { scope: "project", savedIn: { kind: "file", path: [".host", "settings.json"] } },
    { scope: "allProjects", savedIn: { kind: "settingsPage", path: ["Settings", "Marketplaces"] } },
];

/**
 * One list per scope, like a host's stores. Every write lands in
 * `settings.values.marketplaces` as their union, as a host's settings read sees
 * it. The marketplaces the settings start with are registered for all projects.
 */
export class InMemoryMarketplaceRegistrations implements MarketplaceRegistrationsPort {
    /** All projects first, as both hosts list them. */
    readonly lists: Record<MarketplaceScope, MarketplaceSettingsEntry[]>;
    writable: readonly WritableScope[] = BOTH_SCOPES;
    selfHostedIn: SettingsPlace | undefined = { kind: "file", path: ["settings.json"] };

    constructor(private readonly settings: InMemorySettings) {
        this.lists = { allProjects: [...settings.values.marketplaces], project: [] };
    }

    async read(): Promise<MarketplaceRegistrations> {
        return {
            registered: this.registered(),
            writable: this.writable,
            ...(this.selfHostedIn && { selfHostedIn: this.selfHostedIn }),
        };
    }

    async register(location: string, scope: MarketplaceScope): Promise<void> {
        if (!this.lists[scope].includes(location)) {
            this.lists[scope].push(location);
        }
        this.syncSettings();
    }

    async unregister(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        const removed = new Set(entries.map(entryKey));
        for (const scope of Object.keys(this.lists) as MarketplaceScope[]) {
            this.lists[scope] = this.lists[scope].filter((entry) => !removed.has(entryKey(entry)));
        }
        this.syncSettings();
    }

    private registered(): RegisteredMarketplace[] {
        const byKey = new Map<
            string,
            { entry: MarketplaceSettingsEntry; scopes: MarketplaceScope[] }
        >();
        for (const scope of Object.keys(this.lists) as MarketplaceScope[]) {
            for (const entry of this.lists[scope]) {
                const registered = byKey.get(entryKey(entry));
                if (registered) registered.scopes.push(scope);
                else byKey.set(entryKey(entry), { entry, scopes: [scope] });
            }
        }
        return [...byKey.values()];
    }

    // In place, so a test that holds the settings list sees the change.
    private syncSettings(): void {
        const union = this.registered().map(({ entry }) => entry);
        this.settings.values.marketplaces.splice(0, Infinity, ...union);
    }
}

/**
 * Answers each add prompt with the next answer of `answers`, as entered; none
 * left is a dismissal. An answer with a scope the prompt does not offer throws,
 * so a test cannot register in a scope the user was never shown.
 */
export class ScriptedMarketplacePrompt implements MarketplacePromptPort {
    readonly prompts: MarketplaceAddPrompt[] = [];

    constructor(readonly answers: MarketplaceAddAnswer[] = []) {}

    async promptForMarketplace(
        prompt: MarketplaceAddPrompt,
    ): Promise<MarketplaceAddAnswer | undefined> {
        this.prompts.push(prompt);
        const answer = this.answers.shift();
        const offered =
            prompt.scopes.length > 0 ? prompt.scopes.map(({ scope }) => scope) : [prompt.scope];
        if (answer && !offered.includes(answer.scope)) {
            throw new Error(`The add prompt offers no "${answer.scope}" scope.`);
        }
        return answer;
    }
}

function entryKey(entry: MarketplaceSettingsEntry): string {
    return JSON.stringify(entry);
}
