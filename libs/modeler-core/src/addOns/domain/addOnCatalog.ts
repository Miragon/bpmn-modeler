import { ProcessRestart } from "../../kernel/domain/approvableCodeTexts";
import { relativeToRoot } from "../../kernel/domain/rootContainment";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import type {
    ActionView,
    AddOnCatalogModel,
    AddOnGroupView,
    AddOnSourceView,
} from "./addOnCatalogModel";
import { CatalogActionKind, folderGroupIdOf, sourceIdOf } from "./addOnIds";
import { FolderSourceKind, PlacedAddOn, sourceLabelOf, SourcePlace } from "./addOnSourcePlaces";
import {
    ACTION_LABEL,
    CATALOG_READ_FAILED_TEXT,
    CATALOG_REREAD_FAILED_TEXT,
    INSTALLED_PACKAGES_TEXT,
    nestedConfigFolderText,
    NO_ADD_ON_TEXT,
    NO_FOLDER_TEXT,
    ROOT_CONFIG_FOLDER_TEXT,
} from "./addOnTexts";
import { byKindThenName, compare, optional } from "./addOnViewParts";
import { AddOnSession, CodeAddOnFacts, codeAddOnsOf, ShownCode } from "./codeAddOnCatalog";
import { MarketplaceReadme, ReadmePlace, readmePlacesOf } from "./addOnReadme";
import { TemplateAddOnFacts, templateAddOnsOf } from "./templateAddOnCatalog";
import { ShownSource, ShownTemplate, SourceSwitchView } from "./templateAddOnViews";

/** What one listing found: every add-on its owner read, by kind. */
export type AddOnFacts = CodeAddOnFacts & TemplateAddOnFacts;

export interface CatalogBuild {
    readonly model: AddOnCatalogModel;
    /** By add-on id. */
    readonly shown: ReadonlyMap<string, ShownCode>;
    /** By source id, for a source that offers an action. */
    readonly sources: ReadonlyMap<string, ShownSource>;
    /** By add-on id, for a template that offers a switch. */
    readonly templates: ReadonlyMap<string, ShownTemplate>;
    /** What the catalog itself offered, so a request is checked against it. */
    readonly catalogActions: readonly CatalogActionKind[];
    /** By add-on or source id, where a detail reads its README. */
    readonly readmes: ReadonlyMap<string, ReadmePlace>;
}

const SOURCE_DESCRIPTION: Record<FolderSourceKind, (place: SourcePlace, root: string) => string> = {
    installedPackages: () => INSTALLED_PACKAGES_TEXT,
    configFolder: ({ dir, appliesTo }, root) => {
        const belowRoot = relativeToRoot(appliesTo ?? dir, root);
        return belowRoot ? nestedConfigFolderText(belowRoot) : ROOT_CONFIG_FOLDER_TEXT;
    },
};

const PRUNE_ACTIONS: readonly ActionView<CatalogActionKind>[] = [
    { kind: "pruneCache", label: ACTION_LABEL.pruneCache },
];

/**
 * The model every view shows: each add-on inside a workspace folder, placed
 * in the innermost folder and the source it comes from, with its state and
 * the actions that state allows. `shown` keeps what each row showed, so an
 * action is checked against it, never against a payload.
 */
export function catalogModelOf(
    facts: AddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
    revision: number,
): CatalogBuild {
    const code = codeAddOnsOf(facts, session, restart);
    const templates = templateAddOnsOf(facts);
    const placed = [...code, ...templates.placed];
    const groups = [
        ...facts.folders.flatMap((root) => groupOf(root, placed, templates.folderSwitches)),
        ...templates.marketplacesGroup,
    ];
    const actions = [...templates.marketplaceActions, ...PRUNE_ACTIONS];
    const shown = new Map(code.map(({ view, shown }) => [view.id, shown]));
    return {
        model: { revision, groups, actions, ...emptyTextOf(facts.folders, groups) },
        shown,
        sources: templates.sources,
        templates: templates.templates,
        catalogActions: actions.map(({ kind }) => kind),
        readmes: readmePlacesOf(shown, marketplaceReadmesOf(facts)),
    };
}

function marketplaceReadmesOf({ marketplaces }: AddOnFacts): MarketplaceReadme[] {
    if (marketplaces?.kind !== "listed") return [];
    return marketplaces.sources.map(({ id, readmeFile }) => ({
        sourceId: sourceIdOf("marketplace", id),
        ...optional("readmeFile", readmeFile),
    }));
}

function groupOf(
    root: string,
    placed: readonly PlacedAddOn[],
    folderSwitches: ReadonlyMap<string, SourceSwitchView>,
): AddOnGroupView[] {
    const inRoot = placed.filter((each) => each.root === root);
    if (inRoot.length === 0) {
        return [];
    }
    const sources = new Map<string, { place: SourcePlace; addOns: PlacedAddOn[] }>();
    for (const each of inRoot) {
        const sourceId = sourceIdOf(each.source.kind, each.source.dir);
        const known = sources.get(sourceId) ?? { place: each.source, addOns: [] };
        known.addOns.push(each);
        sources.set(sourceId, known);
    }
    return [
        {
            id: folderGroupIdOf(root),
            kind: "folder",
            label: lastWorkspacePathSegment(root),
            description: root,
            sources: [...sources]
                .sort(([idA, a], [idB, b]) => a.place.rank - b.place.rank || compare(idA, idB))
                .map(([id, { place, addOns }]): AddOnSourceView => ({
                    id,
                    kind: place.kind,
                    label: sourceLabelOf(place, root),
                    description: SOURCE_DESCRIPTION[place.kind](place, root),
                    ...optional("stateText", folderSwitches.get(id)?.stateText),
                    actions: folderSwitches.get(id)?.actions ?? [],
                    addOns: addOns.map(({ view }) => view).sort(byKindThenName),
                })),
        },
    ];
}

/** The workspace's own word, as a view shows the marketplaces apart from it. */
function emptyTextOf(
    folders: readonly string[],
    groups: readonly AddOnGroupView[],
): { readonly emptyText?: string } {
    if (groups.some(({ kind }) => kind === "folder")) return {};
    return { emptyText: folders.length === 0 ? NO_FOLDER_TEXT : NO_ADD_ON_TEXT };
}

/**
 * What a view shows when a listing throws: what it read before under that
 * model's own revision, so an allow against those rows still holds, or,
 * without one, a new revision with nothing listed.
 */
export function failedCatalogOf(
    previous: AddOnCatalogModel | undefined,
    revision: number,
): AddOnCatalogModel {
    return previous === undefined
        ? { revision, groups: [], actions: [], problem: CATALOG_READ_FAILED_TEXT }
        : { ...previous, problem: CATALOG_REREAD_FAILED_TEXT };
}
