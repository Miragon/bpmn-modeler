import { MarketplaceSettingsEntry } from "./modelerSettings";
import { TemplateSourceRef } from "./templatePreferences";

/** One registered marketplace as the marketplace owner lists it, before its cached templates are read. */
export interface MarketplaceListing {
    /** Its entry's key, as entries that share one cache slot are still listed apart. */
    readonly id: string;
    readonly entry: MarketplaceSettingsEntry;
    readonly label: string;
    readonly scopeText: string;
    readonly templateFiles: readonly string[];
    readonly problem?: string;
    /** Where the user's switches for its templates live; absent for an entry that cannot be parsed. */
    readonly templateSource?: TemplateSourceRef;
}

export interface UnreadableMarketplaces {
    readonly kind: "unreadable";
    readonly problem: string;
}

/** The registered marketplaces, or why they could not be read. */
export type MarketplacesListing =
    | { readonly kind: "listed"; readonly sources: readonly MarketplaceListing[] }
    | UnreadableMarketplaces;
