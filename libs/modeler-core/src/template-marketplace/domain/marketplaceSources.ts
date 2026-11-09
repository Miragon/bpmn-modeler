import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { marketplaceScopesText } from "./marketplacePrompts";
import { registeredMarketplaces, RegistrationsByScope } from "./marketplaceRegistrations";
import { MarketplaceRegistry, ParsedMarketplaceEntry } from "./marketplaceRegistry";

/** The cached template files of each registration, by its id, as the cache read them. */
export type CachedTemplates =
    | { readonly kind: "read"; readonly byRegistration: ReadonlyMap<string, readonly string[]> }
    | { readonly kind: "failed" };

/** One registered marketplace as the add-on catalog lists it. */
export interface MarketplaceSource {
    /** The registration's cache id, or the entry's label when it cannot be parsed. */
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
        entry,
        label: entries[index].label,
        scopeText: marketplaceScopesText(scopes),
        ...templatesOf(entries[index], cached),
    }));
}

function templatesOf(
    parsed: ParsedMarketplaceEntry,
    cached: CachedTemplates,
): Pick<MarketplaceSource, "id" | "templateFiles" | "problem"> {
    if (parsed.kind === "unparseable") {
        return { id: parsed.label, templateFiles: [], problem: `${parsed.reason}.` };
    }
    const { id } = parsed.registration;
    if (cached.kind === "failed") {
        return { id, templateFiles: [], problem: CACHE_FAILED_TEXT };
    }
    const templateFiles = cached.byRegistration.get(id);
    return templateFiles === undefined
        ? { id, templateFiles: [], problem: NOT_FETCHED_TEXT }
        : { id, templateFiles };
}
