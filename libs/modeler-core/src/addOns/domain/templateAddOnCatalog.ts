import { innermostFolderOf } from "../../kernel/domain/rootContainment";
import { FolderTemplateFileListing } from "../../kernel/domain/templateListing";
import {
    configFolderTemplateSourceOf,
    TemplatePreferencesByScope,
} from "../../kernel/domain/templatePreferences";
import type { ActionView, AddOnGroupView } from "./addOnCatalogModel";
import { CatalogActionKind, sourceIdOf } from "./addOnIds";
import { FolderFacts, PlacedAddOn, SOURCE_PLACE, sourceLabelOf } from "./addOnSourcePlaces";
import { ACTION_LABEL } from "./addOnTexts";
import { optional } from "./addOnViewParts";
import {
    ListedMarketplaces,
    marketplaceSourceOf,
    marketplacesGroupOf,
    ShownSource,
    ShownTemplate,
    SourceSwitchView,
    sourceSwitchViewOf,
    templateRowsOf,
    TemplateSwitches,
} from "./templateAddOnViews";

/** What one listing found of the element templates and the sources they come from. */
export interface TemplateAddOnFacts extends FolderFacts {
    readonly templates: readonly FolderTemplateFileListing[];
    /** Absent on a host that lists no marketplaces. */
    readonly marketplaces?: ListedMarketplaces;
    /** Absent on a host that keeps no template switches: every template is then on, with no switch. */
    readonly templatePreferences?: TemplatePreferencesByScope;
}

/** The element templates' part of the catalog, which the catalog joins with the code add-ons'. */
export interface TemplateAddOnBuild {
    /** The config folders' templates, which a workspace folder's group lists. */
    readonly placed: readonly PlacedAddOn[];
    /** By source id, for a config folder that lists a template its switch can hide. */
    readonly folderSwitches: ReadonlyMap<string, SourceSwitchView>;
    readonly marketplacesGroup: readonly AddOnGroupView[];
    readonly marketplaceActions: readonly ActionView<CatalogActionKind>[];
    /** By source id, for a source that offers an action. */
    readonly sources: ReadonlyMap<string, ShownSource>;
    /** By add-on id, for a template that offers a switch. */
    readonly templates: ReadonlyMap<string, ShownTemplate>;
}

interface PlacedTemplate extends PlacedAddOn {
    /** Only for a template that offers a switch. */
    readonly switched?: { readonly shown: ShownTemplate; readonly switches: TemplateSwitches };
}

/** A config folder's templates switch, as its view shows it and the core keeps it. */
interface FolderSourceSwitch {
    readonly view: SourceSwitchView;
    readonly shown: ShownSource;
}

const MARKETPLACE_CATALOG_ACTIONS: readonly ActionView<CatalogActionKind>[] = [
    { kind: "addMarketplace", label: ACTION_LABEL.addMarketplace },
    { kind: "updateMarketplaces", label: ACTION_LABEL.updateMarketplaces },
];

/** Each config folder's templates placed as its plugins are, then the marketplaces and their own. */
export function templateAddOnsOf(facts: TemplateAddOnFacts): TemplateAddOnBuild {
    const placed = facts.templates.flatMap((listing) => placedTemplates(listing, facts));
    const marketplaceSources =
        facts.marketplaces?.kind === "listed"
            ? facts.marketplaces.sources.map((each) =>
                  marketplaceSourceOf(each, facts.templatePreferences),
              )
            : [];
    const folderSwitches = folderSourceSwitchesOf(placed);
    return {
        placed,
        folderSwitches: new Map([...folderSwitches].map(([id, { view }]) => [id, view] as const)),
        marketplacesGroup: marketplacesGroupOf(
            marketplaceSources.map(({ view }) => view),
            facts.marketplaces?.kind === "unreadable" ? facts.marketplaces.problem : undefined,
        ),
        marketplaceActions: facts.marketplaces === undefined ? [] : MARKETPLACE_CATALOG_ACTIONS,
        sources: new Map([
            ...[...folderSwitches].map(([id, { shown }]) => [id, shown] as const),
            ...marketplaceSources.map(({ view, shown }) => [view.id, shown] as const),
        ]),
        templates: new Map([
            ...placed.flatMap(({ view, switched }) =>
                switched === undefined ? [] : [[view.id, switched.shown] as const],
            ),
            ...marketplaceSources.flatMap(({ templates }) =>
                templates.flatMap(({ view, shown }) =>
                    shown === undefined ? [] : [[view.id, shown] as const],
                ),
            ),
        ]),
    };
}

/** Each config folder that lists a template its switch can hide, on a host that keeps switches. */
function folderSourceSwitchesOf(
    placed: readonly PlacedTemplate[],
): ReadonlyMap<string, FolderSourceSwitch> {
    const switches = new Map<string, FolderSourceSwitch>();
    for (const { root, source, switched } of placed) {
        const id = sourceIdOf(source.kind, source.dir);
        if (switched === undefined || switches.has(id)) continue;
        const view = sourceSwitchViewOf(switched.switches);
        switches.set(id, {
            view,
            shown: {
                kind: "configFolder",
                label: sourceLabelOf(source, root),
                templateSource: switched.switches.source,
                actions: view.actions.map(({ kind }) => kind),
            },
        });
    }
    return switches;
}

function placedTemplates(
    listing: FolderTemplateFileListing,
    facts: TemplateAddOnFacts,
): PlacedTemplate[] {
    const root = innermostFolderOf(listing.path, facts.folders);
    if (root === undefined) {
        return [];
    }
    const source = SOURCE_PLACE.elementTemplate(listing.sourceDir, root, facts.configFolder);
    const switches: TemplateSwitches | undefined = facts.templatePreferences && {
        source: configFolderTemplateSourceOf(listing.sourceDir, facts.folders),
        preferences: facts.templatePreferences,
    };
    return templateRowsOf(sourceIdOf(source.kind, source.dir), listing, switches).map(
        ({ view, shown }) => ({
            root,
            source,
            view,
            ...optional("switched", switches && shown && { shown, switches }),
        }),
    );
}
