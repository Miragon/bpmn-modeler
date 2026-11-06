import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";

/**
 * For the open project only, or for every project the user opens; in the
 * order the core offers them, as an add is a per-project concern unless the
 * user shares it.
 */
export const MARKETPLACE_SCOPES = ["project", "allProjects"] as const;

export type MarketplaceScope = (typeof MARKETPLACE_SCOPES)[number];

/**
 * Where a host keeps something the user can open, as a fact the core words: a
 * file, by its path segments, or a page of the host's settings, by the names
 * that lead to it.
 */
export interface SettingsPlace {
    readonly kind: "file" | "settingsPage";
    readonly path: readonly string[];
}

export interface WritableScope {
    readonly scope: MarketplaceScope;
    readonly savedIn: SettingsPlace;
}

export interface RegisteredMarketplace {
    readonly entry: MarketplaceSettingsEntry;
    readonly scopes: readonly MarketplaceScope[];
}

/** What a host reports about its marketplace registrations; the core words it. */
export interface MarketplaceRegistrations {
    readonly registered: readonly RegisteredMarketplace[];
    /** The scopes the host can register in now. */
    readonly writable: readonly WritableScope[];
    /**
     * Where the user writes a self-hosted marketplace by hand, as a URL cannot
     * name one; absent on a host that cannot register one.
     */
    readonly selfHostedIn?: SettingsPlace;
}
