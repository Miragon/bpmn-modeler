import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { marketplaceScopesText } from "./marketplacePrompts";
import {
    marketplaceEntryKey,
    registeredMarketplaces,
    RegistrationsByScope,
} from "./marketplaceRegistrations";
import { MarketplaceRegistry, ParsedMarketplaceEntry } from "./marketplaceRegistry";

/** The cached template files of each registration, by its id, as the cache read them. */
export type CachedTemplates =
    | { readonly kind: "read"; readonly byRegistration: ReadonlyMap<string, readonly string[]> }
    | { readonly kind: "failed" };

/** One registered marketplace as the add-on catalog lists it. */
export interface MarketplaceSource {
    /** Its entry's key, as entries that share one cache slot are still listed apart. */
    readonly id: string;
    readonly entry: MarketplaceSettingsEntry;
    readonly label: string;
    readonly scopeText: string;
    readonly templateFiles: readonly string[];
    readonly problem?: string;
}

const NOT_FETCHED_TEXT = "No templates fetched yet. Update the marketplaces to fetch them.";
const CACHE_FAILED_TEXT = "Its cached templates could not be read. The log says why.";

/** Each registered entry once, in the order the hosts fetch them, with the templates cached for it. */
export function marketplaceSourcesOf(
    registered: RegistrationsByScope,
    cached: CachedTemplates,
): MarketplaceSource[] {
    const listed = registeredMarketplaces(registered);
    const { entries } = MarketplaceRegistry.fromEntries(listed.map(({ entry }) => entry));
    return listed.map(({ entry, scopes }, index) => ({
        id: marketplaceEntryKey(entry),
        entry,
        label: entries[index].label,
        scopeText: marketplaceScopesText(scopes),
        ...templatesOf(entries[index], cached),
    }));
}

function templatesOf(
    parsed: ParsedMarketplaceEntry,
    cached: CachedTemplates,
): Pick<MarketplaceSource, "templateFiles" | "problem"> {
    if (parsed.kind === "unparseable") {
        return { templateFiles: [], problem: `${parsed.reason}.` };
    }
    if (cached.kind === "failed") {
        return { templateFiles: [], problem: CACHE_FAILED_TEXT };
    }
    const templateFiles = cached.byRegistration.get(parsed.registration.id);
    return templateFiles === undefined
        ? { templateFiles: [], problem: NOT_FETCHED_TEXT }
        : { templateFiles };
}
