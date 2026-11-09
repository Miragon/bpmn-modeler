import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { expandHomePath, parseMarketplaceUrl } from "./marketplace";

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

export type JoinPath = (base: string, rest: string) => string;

/** The location an add fetches and saves, or `undefined` when `parseMarketplaceUrl` refuses it. */
export function registrableLocation(
    input: string,
    homeDir: string,
    joinPath?: JoinPath,
): string | undefined {
    const location = expandHomePath(input.trim(), homeDir, joinPath);
    try {
        parseMarketplaceUrl(location);
        return location;
    } catch {
        return undefined;
    }
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
            const listed = byKey.get(marketplaceEntryKey(entry));
            if (!listed) byKey.set(marketplaceEntryKey(entry), { entry, scopes: [scope] });
            else if (!listed.scopes.includes(scope)) listed.scopes.push(scope);
        }
    }
    return [...byKey.values()];
}

/** The entry with every scope whose list holds it, matched as {@link registeredMarketplaces} matches them. */
export function registeredMarketplaceOf(
    registered: RegistrationsByScope,
    entry: MarketplaceSettingsEntry,
): RegisteredMarketplace | undefined {
    const key = marketplaceEntryKey(entry);
    return registeredMarketplaces(registered).find(
        (listed) => marketplaceEntryKey(listed.entry) === key,
    );
}

/** This project fetches the entries of every list, all projects only their own. */
const LISTS_A_SCOPE_REACHES: Record<MarketplaceScope, readonly MarketplaceScope[]> = {
    project: MARKETPLACE_SCOPES,
    allProjects: ["allProjects"],
};

type HoldingScopes = readonly [MarketplaceScope, ...MarketplaceScope[]];

/**
 * `registeredIn` names every scope whose list holds the entry, all projects
 * first, not only those the add reaches.
 */
export type MarketplaceAddOutcome =
    | { readonly kind: "registered" }
    | { readonly kind: "alreadyRegistered"; readonly registeredIn: HoldingScopes };

/**
 * An add of `entry` for `scope` registers nothing when a list that scope reaches
 * holds the entry already. An entry of this project can still be shared with all
 * projects. Entries match by their fields, as {@link registeredMarketplaces}
 * matches them.
 */
export function marketplaceAddOutcome(
    registered: RegistrationsByScope,
    entry: MarketplaceSettingsEntry,
    scope: MarketplaceScope,
): MarketplaceAddOutcome {
    const registeredIn = scopesHolding(registered, entry);
    return holdsAListReachedBy(scope, registeredIn)
        ? { kind: "alreadyRegistered", registeredIn }
        : { kind: "registered" };
}

function scopesHolding(
    registered: RegistrationsByScope,
    entry: MarketplaceSettingsEntry,
): MarketplaceScope[] {
    const key = marketplaceEntryKey(entry);
    return LISTING_ORDER.filter((scope) =>
        registered[scope].some((listed) => marketplaceEntryKey(listed) === key),
    );
}

// Sound as a guard: `some` holds only for a list with at least one scope.
function holdsAListReachedBy(
    scope: MarketplaceScope,
    holding: readonly MarketplaceScope[],
): holding is HoldingScopes {
    return holding.some((held) => LISTS_A_SCOPE_REACHES[scope].includes(held));
}

/** The list without the removed entries, matched as {@link registeredMarketplaces} matches them. */
export function withoutMarketplaceEntries(
    list: readonly MarketplaceSettingsEntry[],
    removed: readonly MarketplaceSettingsEntry[],
): MarketplaceSettingsEntry[] {
    const removedKeys = new Set(removed.map(marketplaceEntryKey));
    return list.filter((entry) => !removedKeys.has(marketplaceEntryKey(entry)));
}

// Field order counts, which is safe: a removal names the entries as read from these lists.
export function marketplaceEntryKey(entry: MarketplaceSettingsEntry): string {
    return JSON.stringify(entry);
}
