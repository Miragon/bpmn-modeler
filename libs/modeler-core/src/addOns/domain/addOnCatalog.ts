import {
    ApprovableArtifact,
    ApprovableCodeTexts,
    CodeApproval,
    CodeState,
    codeStateOf,
    declinedKeys,
    isApprovedState,
    ListedCode,
    ListedPresence,
    presenceIdOf,
    ProcessRestart,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { folderOfConfigFolder } from "../../kernel/domain/configArtifacts";
import {
    innermostFolderOf,
    relativeToRoot,
    relativeToWorkspace,
} from "../../kernel/domain/rootContainment";
import { FolderTemplateFileListing } from "../../kernel/domain/templateListing";
import {
    configFolderTemplateSourceOf,
    TemplatePreferencesByScope,
} from "../../kernel/domain/templatePreferences";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import type {
    ActionView,
    AddOnCatalogModel,
    AddOnGroupView,
    AddOnReview,
    AddOnSourceView,
    AddOnView,
    CodeAddOnView,
} from "./addOnCatalogModel";
import {
    AddOnActionKind,
    AddOnKind,
    addOnIdOf,
    CatalogActionKind,
    CodeAddOnKind,
    folderGroupIdOf,
    SourceKind,
    sourceIdOf,
} from "./addOnIds";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    allowWarningText,
    cannotBeAllowedText,
    codeStateLabel,
    INSTALLED_PACKAGES_TEXT,
    nestedConfigFolderText,
    NO_ADD_ON_TEXT,
    NO_FOLDER_TEXT,
    REVIEW_FACT_LABEL,
    reviewHeading,
    ROOT_CONFIG_FOLDER_TEXT,
} from "./addOnTexts";
import { byKindThenName, compare, optional } from "./addOnViewParts";
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

/** One add-on as its owner read it, placed and spoke of it. */
export interface OwnedPresence {
    readonly presence: ListedPresence;
    /** A plugin's config folder, or the `node_modules` a rule package is installed in. */
    readonly sourceDir: string;
    readonly texts: ApprovableCodeTexts;
}

/** What one listing found: every add-on its owner read, by kind. */
export interface AddOnFacts {
    readonly folders: readonly string[];
    readonly configFolder: string;
    readonly approvals: readonly CodeApproval[];
    readonly plugins: readonly OwnedPresence[];
    readonly rulePackages: readonly OwnedPresence[];
    readonly templates: readonly FolderTemplateFileListing[];
    /** Absent on a host that lists no marketplaces. */
    readonly marketplaces?: ListedMarketplaces;
    /** Absent on a host that keeps no template switches: every template is then on, with no switch. */
    readonly templatePreferences?: TemplatePreferencesByScope;
}

/** What this process remembers beyond the stored approvals, by kind as each owner tells it. */
export interface AddOnSession {
    readonly answers: Readonly<Record<CodeAddOnKind, ReadonlyMap<string, SessionAnswer>>>;
    /** Revoked this session, with code that may still be loaded. */
    readonly stillLoaded: Readonly<Record<CodeAddOnKind, ReadonlySet<string>>>;
}

/** What the core showed of one add-on; kept by the core and never sent. */
export interface ShownCode {
    readonly kind: CodeAddOnKind;
    /** The id its approval row names. */
    readonly id: string;
    readonly name: string;
    /** The content shown, when it was hashed. */
    readonly content?: ApprovableArtifact;
    /** A request is checked against these, so no view acts on a row as it was not shown. */
    readonly actions: readonly AddOnActionKind[];
    readonly allowedFollowUp: string;
    readonly revokedFollowUp: string;
    /** No notice in this process asks about it again once revoked from the view. */
    readonly leftForViewByRevoke: readonly ApprovableArtifact[];
}

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
}

interface ListedAddOn extends OwnedPresence {
    readonly kind: CodeAddOnKind;
}

interface StatedAddOn extends ListedAddOn {
    readonly id: string;
    readonly state: CodeState;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

interface PlacedAddOn {
    readonly root: string;
    readonly source: SourcePlace;
    readonly view: AddOnView;
    /** Only for an add-on that offers an action. */
    readonly shown?: ShownCode;
    /** Only for a template that offers a switch. */
    readonly switched?: { readonly shown: ShownTemplate; readonly switches: TemplateSwitches };
}

/** A config folder's templates switch, as its view shows it and the core keeps it. */
interface FolderSourceSwitch {
    readonly view: SourceSwitchView;
    readonly shown: ShownSource;
}

type FolderSourceKind = Exclude<SourceKind, "marketplace">;

interface SourcePlace {
    readonly kind: FolderSourceKind;
    readonly dir: string;
    /** The folder whose diagrams it applies to, for a config folder of the current setting. */
    readonly appliesTo?: string;
    /** Sorts the root's own config folder first. */
    readonly rank: number;
}

type PresenceKind = ListedPresence["kind"];

/** Keyed by what the owner read and the state it decides, so no row compares raw values. */
const CODE_ACTIONS: Record<
    PresenceKind,
    Partial<Record<CodeState, readonly ActionView<AddOnActionKind>[]>>
> = {
    found: {
        approved: [{ kind: "revoke", label: ACTION_LABEL.revoke }],
        new: [{ kind: "allow", label: ACTION_LABEL.allow }],
        changed: [{ kind: "allow", label: ACTION_LABEL.allow }],
        declined: [{ kind: "allow", label: ACTION_LABEL.allow }],
    },
    unhashed: { new: [{ kind: "inspect", label: ACTION_LABEL.inspect }] },
    unreadable: { changed: [{ kind: "revoke", label: ACTION_LABEL.revoke }] },
    gone: { gone: [{ kind: "revoke", label: ACTION_LABEL.forget }] },
};

function configFolderPlace(dir: string, root: string, configFolder: string): SourcePlace {
    const appliesTo = folderOfConfigFolder(dir, configFolder);
    return { kind: "configFolder", dir, appliesTo, rank: appliesTo === root ? 0 : 1 };
}

const SOURCE_PLACE: Record<
    AddOnKind,
    (dir: string, root: string, configFolder: string) => SourcePlace
> = {
    plugin: configFolderPlace,
    elementTemplate: configFolderPlace,
    rulePackage: (dir) => ({ kind: "installedPackages", dir, rank: 2 }),
};

const DETAIL: Record<
    CodeAddOnKind,
    (presence: ListedPresence, sourceDir: string) => string | undefined
> = {
    plugin: (presence, sourceDir) => relativeToRoot(presenceIdOf(presence), sourceDir),
    rulePackage: (presence) => (presence.kind === "found" ? presence.artifact.version : undefined),
};

const SOURCE_DESCRIPTION: Record<FolderSourceKind, (place: SourcePlace, root: string) => string> = {
    installedPackages: () => INSTALLED_PACKAGES_TEXT,
    configFolder: ({ dir, appliesTo }, root) => {
        const belowRoot = relativeToRoot(appliesTo ?? dir, root);
        return belowRoot ? nestedConfigFolderText(belowRoot) : ROOT_CONFIG_FOLDER_TEXT;
    },
};

const MARKETPLACE_CATALOG_ACTIONS: readonly ActionView<CatalogActionKind>[] = [
    { kind: "addMarketplace", label: ACTION_LABEL.addMarketplace },
    { kind: "updateMarketplaces", label: ACTION_LABEL.updateMarketplaces },
];

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
    const listed: ListedAddOn[] = [
        ...facts.plugins.map((each) => ({ kind: "plugin" as const, ...each })),
        ...facts.rulePackages.map((each) => ({ kind: "rulePackage" as const, ...each })),
    ];
    const placed = [
        ...listed.flatMap((each) => placedAddOn(each, facts, session, restart)),
        ...facts.templates.flatMap((listing) => placedTemplates(listing, facts)),
    ];
    const marketplaceSources =
        facts.marketplaces?.kind === "listed"
            ? facts.marketplaces.sources.map((each) =>
                  marketplaceSourceOf(each, facts.templatePreferences),
              )
            : [];
    const folderSwitches = folderSourceSwitchesOf(placed);
    const groups = [
        ...facts.folders.flatMap((root) => groupOf(root, placed, folderSwitches)),
        ...marketplacesGroupOf(
            marketplaceSources.map(({ view }) => view),
            facts.marketplaces?.kind === "unreadable" ? facts.marketplaces.problem : undefined,
        ),
    ];
    const actions =
        facts.marketplaces === undefined
            ? PRUNE_ACTIONS
            : [...MARKETPLACE_CATALOG_ACTIONS, ...PRUNE_ACTIONS];
    return {
        model: { revision, groups, actions, ...emptyTextOf(facts.folders, groups) },
        shown: new Map(
            placed.flatMap(({ view, shown }) => (shown === undefined ? [] : [[view.id, shown]])),
        ),
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
        catalogActions: actions.map(({ kind }) => kind),
    };
}

/** Each config folder that lists a template its switch can hide, on a host that keeps switches. */
function folderSourceSwitchesOf(
    placed: readonly PlacedAddOn[],
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

function placedTemplates(listing: FolderTemplateFileListing, facts: AddOnFacts): PlacedAddOn[] {
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

function placedAddOn(
    listed: ListedAddOn,
    facts: AddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedAddOn[] {
    const { kind, presence, sourceDir } = listed;
    const id = presenceIdOf(presence);
    const root = innermostFolderOf(id, facts.folders);
    if (root === undefined) {
        return [];
    }
    const source = SOURCE_PLACE[kind](sourceDir, root, facts.configFolder);
    const reading = codeStateOf(presence, facts.approvals, declinedKeys(session.answers[kind]));
    const state = reading.kind === "state" ? reading.state : "new";
    const row: StatedAddOn = {
        ...listed,
        id,
        state,
        actions: CODE_ACTIONS[presence.kind][state] ?? [],
    };
    return [
        {
            root,
            source,
            view: viewOf(row, source, facts.folders, session, restart),
            shown: shownOf(row, restart),
        },
    ];
}

function viewOf(
    row: StatedAddOn,
    source: SourcePlace,
    folders: readonly string[],
    session: AddOnSession,
    restart: ProcessRestart,
): CodeAddOnView {
    const { kind, presence, id, state, actions } = row;
    return {
        id: addOnIdOf(kind, id),
        kind,
        kindText: ADD_ON_KIND_TEXT[kind],
        name: presence.name,
        ...optional("detail", DETAIL[kind](presence, source.dir)),
        state,
        stateText: codeStateLabel(state),
        ...optional("problem", problemOf(presence)),
        ...optional("note", noteOf(row, session, restart)),
        ...optional("review", reviewOfRow(row, folders)),
        actions,
    };
}

function problemOf(presence: ListedPresence): string | undefined {
    return presence.kind === "unreadable" ? cannotBeAllowedText(presence.reason) : undefined;
}

function noteOf(
    { kind, id, state, texts }: StatedAddOn,
    session: AddOnSession,
    restart: ProcessRestart,
): string | undefined {
    return !isApprovedState(state) && session.stillLoaded[kind].has(id)
        ? texts.revokedFollowUp(restart)
        : undefined;
}

function reviewOfRow(
    { presence, texts, actions }: StatedAddOn,
    folders: readonly string[],
): AddOnReview | undefined {
    return presence.kind === "found" && offers(actions, "allow")
        ? reviewOf(texts, presence.artifact, folders)
        : undefined;
}

function shownOf(row: StatedAddOn, restart: ProcessRestart): ShownCode {
    const { kind, id, presence, texts, actions } = row;
    const content = shownContentOf(presence);
    return {
        kind,
        id,
        name: presence.name,
        ...optional("content", content),
        actions: actions.map((action) => action.kind),
        allowedFollowUp: texts.allowedFollowUp,
        revokedFollowUp: texts.revokedFollowUp(restart),
        leftForViewByRevoke: content !== undefined && offers(actions, "revoke") ? [content] : [],
    };
}

/** Only what an allow is checked against, never the listing's extra facts. */
function shownContentOf(presence: ListedPresence): ApprovableArtifact | undefined {
    if (presence.kind !== "found") {
        return undefined;
    }
    const { id, name, contentHash } = presence.artifact;
    return { id, name, contentHash };
}

function offers(actions: readonly ActionView<AddOnActionKind>[], kind: AddOnActionKind): boolean {
    return actions.some((action) => action.kind === kind);
}

function groupOf(
    root: string,
    placed: readonly PlacedAddOn[],
    folderSwitches: ReadonlyMap<string, FolderSourceSwitch>,
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
            label: lastWorkspacePathSegment(root),
            description: root,
            sources: [...sources]
                .sort(([idA, a], [idB, b]) => a.place.rank - b.place.rank || compare(idA, idB))
                .map(([id, { place, addOns }]): AddOnSourceView => ({
                    id,
                    kind: place.kind,
                    label: sourceLabelOf(place, root),
                    description: SOURCE_DESCRIPTION[place.kind](place, root),
                    ...optional("stateText", folderSwitches.get(id)?.view.stateText),
                    actions: folderSwitches.get(id)?.view.actions ?? [],
                    addOns: addOns.map(({ view }) => view).sort(byKindThenName),
                })),
        },
    ];
}

function sourceLabelOf(place: SourcePlace, root: string): string {
    return relativeToRoot(place.dir, root) || lastWorkspacePathSegment(place.dir);
}

function reviewOf(
    texts: ApprovableCodeTexts,
    content: ListedCode,
    folders: readonly string[],
): AddOnReview {
    const where = (path: string) => relativeToWorkspace(path, folders);
    return {
        heading: reviewHeading(content.name),
        warning: allowWarningText(texts.risk),
        facts: [
            { label: REVIEW_FACT_LABEL.folder, value: where(content.id) },
            ...(content.version === undefined
                ? []
                : [{ label: REVIEW_FACT_LABEL.version, value: content.version }]),
            { label: REVIEW_FACT_LABEL.files, value: content.files.map(where).join(", ") },
            { label: REVIEW_FACT_LABEL.contentHash, value: content.contentHash },
        ],
    };
}

function emptyTextOf(
    folders: readonly string[],
    groups: readonly AddOnGroupView[],
): { readonly emptyText?: string } {
    if (groups.length > 0) return {};
    return { emptyText: folders.length === 0 ? NO_FOLDER_TEXT : NO_ADD_ON_TEXT };
}
