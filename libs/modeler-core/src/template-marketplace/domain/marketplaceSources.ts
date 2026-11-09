import {
    CachedTemplateSource,
    MarketplaceListing,
    MarketplacesListing,
} from "../../kernel/domain/marketplaceListing";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { TemplateSourceRef, templateSourceScopeOf } from "../../kernel/domain/templatePreferences";
import { MarketplaceRegistration, marketplacePreferenceKeyOf } from "./marketplace";
import { marketplaceListingScopeText } from "./marketplacePrompts";
import {
    marketplaceEntryKey,
    RegisteredMarketplace,
    registeredMarketplaces,
    RegistrationsByScope,
} from "./marketplaceRegistrations";
import { MarketplaceRegistry, ParsedMarketplaceEntry } from "./marketplaceRegistry";

/** The cached template files of each registration, by its id, as the cache read them. */
export type CachedTemplates =
    | { readonly kind: "read"; readonly byRegistration: ReadonlyMap<string, readonly string[]> }
    | { readonly kind: "failed" };

export const REGISTRATIONS_UNREADABLE: MarketplacesListing = {
    kind: "unreadable",
    problem: "The registered marketplaces could not be read. The log says why.",
};

const NOT_FETCHED_TEXT = "No templates fetched yet. Update the marketplaces to fetch them.";
const CACHE_FAILED_TEXT = "Its cached templates could not be read. The log says why.";

/** Each registered entry once, in the order the hosts fetch them, with the templates cached for it. */
export function marketplaceSourcesOf(
    registered: RegistrationsByScope,
    cached: CachedTemplates,
): MarketplaceListing[] {
    const listed = registeredMarketplaces(registered);
    const { entries } = MarketplaceRegistry.fromEntries(listed.map(({ entry }) => entry));
    const switched = switchedRegistrationsOf(listed, entries);
    return listed.map(({ entry, scopes }, index) => ({
        id: marketplaceEntryKey(entry),
        entry,
        label: entries[index].label,
        scopeText: marketplaceListingScopeText(scopes, switched[index]?.source.scope),
        ...templatesOf(entries[index], cached),
        ...optionalSource(switched[index]),
    }));
}

interface SwitchedRegistration {
    readonly registration: MarketplaceRegistration;
    readonly source: TemplateSourceRef;
}

/**
 * Each entry's switches by its repository, so two refs of one repository share
 * them, in the one scope they live in: all projects once any of its entries is
 * registered there. An entry that cannot be parsed has none.
 */
function switchedRegistrationsOf(
    listed: readonly RegisteredMarketplace[],
    entries: readonly ParsedMarketplaceEntry[],
): (SwitchedRegistration | undefined)[] {
    const keys = entries.map((parsed) =>
        parsed.kind === "registered"
            ? marketplacePreferenceKeyOf(parsed.registration.location)
            : undefined,
    );
    const scopesOf = (key: string) =>
        listed.flatMap(({ scopes }, index) => (keys[index] === key ? scopes : []));
    return entries.map((parsed) => {
        if (parsed.kind === "unparseable") return undefined;
        const key = marketplacePreferenceKeyOf(parsed.registration.location);
        return {
            registration: parsed.registration,
            source: { key, scope: templateSourceScopeOf(scopesOf(key)) },
        };
    });
}

function optionalSource(
    switched: SwitchedRegistration | undefined,
): Pick<MarketplaceListing, "templateSource"> {
    return switched === undefined ? {} : { templateSource: switched.source };
}

function templatesOf(
    parsed: ParsedMarketplaceEntry,
    cached: CachedTemplates,
): Pick<MarketplaceListing, "templateFiles" | "problem"> {
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

/**
 * The templates editors load: each registered entry's slot once, so a slot
 * left behind by an entry removed by hand is not served before a prune deletes it.
 */
export function registeredTemplateFiles(
    entries: readonly MarketplaceSettingsEntry[],
    byRegistration: ReadonlyMap<string, readonly string[]>,
): string[] {
    const registeredIds = new Set(
        MarketplaceRegistry.fromEntries(entries).registrations.map(({ id }) => id),
    );
    return [...registeredIds].flatMap((id) => byRegistration.get(id) ?? []);
}

/** As {@link registeredTemplateFiles} serves them: each registered slot once, in the order the hosts fetch them. */
export function registeredTemplateSources(
    registered: RegistrationsByScope,
    byRegistration: ReadonlyMap<string, readonly string[]>,
): CachedTemplateSource[] {
    const listed = registeredMarketplaces(registered);
    const { entries } = MarketplaceRegistry.fromEntries(listed.map(({ entry }) => entry));
    const served = new Set<string>();
    return switchedRegistrationsOf(listed, entries).flatMap((switched): CachedTemplateSource[] => {
        if (switched === undefined) return [];
        const { registration, source } = switched;
        const paths = byRegistration.get(registration.id);
        if (paths === undefined || served.has(registration.id)) return [];
        served.add(registration.id);
        return [{ source, paths }];
    });
}
