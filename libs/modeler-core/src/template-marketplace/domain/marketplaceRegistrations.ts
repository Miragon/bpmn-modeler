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

/** Each scope's own list, as the host stores it. */
export type RegistrationsByScope = Readonly<
    Record<MarketplaceScope, readonly MarketplaceSettingsEntry[]>
>;

/** What a host reports about its marketplace registrations; the core words it. */
export interface MarketplaceRegistrations {
    readonly registered: RegistrationsByScope;
    /** The scopes the host can register in now. */
    readonly writable: readonly WritableScope[];
    /**
     * Where the user writes a self-hosted marketplace by hand, as a URL cannot
     * name one; absent on a host that cannot register one.
     */
    readonly selfHostedIn?: SettingsPlace;
}

/** All-projects entries first, as both hosts union their lists for the fetch. */
const LISTING_ORDER: readonly MarketplaceScope[] = ["allProjects", "project"];

/**
 * Each registered entry once, with every scope whose list holds it. Entries
 * match by their fields, so a self-hosted entry in both lists is one marketplace.
 */
export function registeredMarketplaces(registered: RegistrationsByScope): RegisteredMarketplace[] {
    const byKey = new Map<
        string,
        { entry: MarketplaceSettingsEntry; scopes: MarketplaceScope[] }
    >();
    for (const scope of LISTING_ORDER) {
        for (const entry of registered[scope]) {
            const listed = byKey.get(entryKey(entry));
            if (!listed) byKey.set(entryKey(entry), { entry, scopes: [scope] });
            else if (!listed.scopes.includes(scope)) listed.scopes.push(scope);
        }
    }
    return [...byKey.values()];
}

/** The list without the removed entries, matched as {@link registeredMarketplaces} matches them. */
export function withoutMarketplaceEntries(
    list: readonly MarketplaceSettingsEntry[],
    removed: readonly MarketplaceSettingsEntry[],
): MarketplaceSettingsEntry[] {
    const removedKeys = new Set(removed.map(entryKey));
    return list.filter((entry) => !removedKeys.has(entryKey(entry)));
}

// Field order counts, which is safe: a removal names the entries as read from these lists.
function entryKey(entry: MarketplaceSettingsEntry): string {
    return JSON.stringify(entry);
}
