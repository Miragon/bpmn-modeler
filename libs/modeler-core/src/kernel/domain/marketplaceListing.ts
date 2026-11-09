import { MarketplaceSettingsEntry } from "./modelerSettings";

/** One registered marketplace as the marketplace owner lists it, before its cached templates are read. */
export interface MarketplaceListing {
    /** Its entry's key, as entries that share one cache slot are still listed apart. */
    readonly id: string;
    readonly entry: MarketplaceSettingsEntry;
    readonly label: string;
    readonly scopeText: string;
    readonly templateFiles: readonly string[];
    readonly problem?: string;
}

export interface UnreadableMarketplaces {
    readonly kind: "unreadable";
    readonly problem: string;
}

/** The registered marketplaces, or why they could not be read. */
export type MarketplacesListing =
    | { readonly kind: "listed"; readonly sources: readonly MarketplaceListing[] }
    | UnreadableMarketplaces;
