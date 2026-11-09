import { type Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

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
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import {
    innermostFolderOf,
    relativeToRoot,
    relativeToWorkspace,
} from "../../kernel/domain/rootContainment";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import type {
    ActionView,
    AddOnCatalogModel,
    AddOnGroupView,
    AddOnReview,
    AddOnSourceView,
    AddOnView,
    CodeAddOnView,
    TemplateAddOnView,
} from "./addOnCatalogModel";
import {
    ADD_ON_KINDS,
    AddOnActionKind,
    AddOnKind,
    addOnIdOf,
    CatalogActionKind,
    CodeAddOnKind,
    folderGroupIdOf,
    MARKETPLACES_GROUP_ID,
    SourceActionKind,
    SourceKind,
    sourceIdOf,
    templateAddOnIdOf,
    TemplateState,
} from "./addOnIds";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    allowWarningText,
    cannotBeAllowedText,
    cannotBeReadText,
    codeStateLabel,
    INSTALLED_PACKAGES_TEXT,
    MARKETPLACES_GROUP_TEXT,
    nestedConfigFolderText,
    NO_ADD_ON_TEXT,
    NO_FOLDER_TEXT,
    REVIEW_FACT_LABEL,
    reviewHeading,
    ROOT_CONFIG_FOLDER_TEXT,
    TEMPLATE_STATE_TEXT,
    templateVersionText,
} from "./addOnTexts";

/** One add-on as its owner read it, placed and spoke of it. */
export interface OwnedPresence {
    readonly presence: ListedPresence;
    /** A plugin's config folder, or the `node_modules` a rule package is installed in. */
    readonly sourceDir: string;
    readonly texts: ApprovableCodeTexts;
}

interface ListedTemplate {
    readonly id?: string;
    readonly name?: string;
    readonly version?: number;
}

/** One template file as the template owner read it. */
export interface TemplateFileListing {
    readonly path: string;
    readonly reading:
        | {
              readonly kind: "read";
              readonly templates: readonly ListedTemplate[];
              readonly engine?: Engine;
          }
        | { readonly kind: "unreadable"; readonly reason: string };
}

export interface FolderTemplateFileListing extends TemplateFileListing {
    /** The config folder whose templates folder holds the file. */
    readonly sourceDir: string;
}

/** One registered marketplace as its owner listed and worded it, with its cached templates read. */
export interface ListedMarketplace {
    /** Unique per registered entry. */
    readonly id: string;
    readonly entry: MarketplaceSettingsEntry;
    readonly label: string;
    readonly scopeText: string;
    readonly problem?: string;
    readonly templates: readonly TemplateFileListing[];
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
    readonly marketplaces?: readonly ListedMarketplace[];
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

/** What the core showed of one marketplace source; kept by the core and never sent. */
export interface ShownSource {
    readonly entry: MarketplaceSettingsEntry;
    readonly actions: readonly SourceActionKind[];
}

export interface CatalogBuild {
    readonly model: AddOnCatalogModel;
    /** By add-on id. */
    readonly shown: ReadonlyMap<string, ShownCode>;
    /** By source id. */
    readonly sources: ReadonlyMap<string, ShownSource>;
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

const MARKETPLACE_SOURCE_ACTIONS: readonly ActionView<SourceActionKind>[] = [
    { kind: "removeMarketplace", label: ACTION_LABEL.removeMarketplace },
];

const TEMPLATE_STATE: TemplateState = "enabled";

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
    const marketplaceSources = (facts.marketplaces ?? []).map(marketplaceSourceOf);
    const groups = [
        ...facts.folders.flatMap((root) => groupOf(root, placed)),
        ...marketplacesGroupOf(marketplaceSources.map(({ view }) => view)),
    ];
    return {
        model: {
            revision,
            groups,
            actions:
                facts.marketplaces === undefined
                    ? PRUNE_ACTIONS
                    : [...MARKETPLACE_CATALOG_ACTIONS, ...PRUNE_ACTIONS],
            ...emptyTextOf(facts.folders, groups),
        },
        shown: new Map(
            placed.flatMap(({ view, shown }) => (shown === undefined ? [] : [[view.id, shown]])),
        ),
        sources: new Map(marketplaceSources.map(({ view, shown }) => [view.id, shown])),
    };
}

function placedTemplates(listing: FolderTemplateFileListing, facts: AddOnFacts): PlacedAddOn[] {
    const root = innermostFolderOf(listing.path, facts.folders);
    if (root === undefined) {
        return [];
    }
    const source = SOURCE_PLACE.elementTemplate(listing.sourceDir, root, facts.configFolder);
    return templateViewsOf(sourceIdOf(source.kind, source.dir), listing).map((view) => ({
        root,
        source,
        view,
    }));
}

/** Each template of a file, or the file once when it cannot be read; a blank file holds none. */
function templateViewsOf(
    sourceId: string,
    { path, reading }: TemplateFileListing,
): TemplateAddOnView[] {
    const fileName = lastWorkspacePathSegment(path);
    if (reading.kind === "unreadable") {
        return [
            {
                ...templateViewBase(templateAddOnIdOf(sourceId, path), fileName),
                problem: cannotBeReadText(reading.reason),
            },
        ];
    }
    const engineText = reading.engine === undefined ? undefined : ENGINE_LABEL[reading.engine];
    return reading.templates.map((template, index) => ({
        ...templateViewBase(
            templateAddOnIdOf(sourceId, path, template, index),
            template.name ?? template.id ?? fileName,
        ),
        ...optional(
            "detail",
            template.version === undefined ? undefined : templateVersionText(template.version),
        ),
        ...optional("engineText", engineText),
    }));
}

function templateViewBase(id: string, name: string): TemplateAddOnView {
    return {
        id,
        kind: "elementTemplate",
        kindText: ADD_ON_KIND_TEXT.elementTemplate,
        name,
        state: TEMPLATE_STATE,
        stateText: TEMPLATE_STATE_TEXT[TEMPLATE_STATE],
        actions: [],
    };
}

function marketplaceSourceOf(marketplace: ListedMarketplace): {
    readonly view: AddOnSourceView;
    readonly shown: ShownSource;
} {
    const id = sourceIdOf("marketplace", marketplace.id);
    return {
        view: {
            id,
            kind: "marketplace",
            label: marketplace.label,
            description: marketplace.scopeText,
            ...optional("problem", marketplace.problem),
            actions: MARKETPLACE_SOURCE_ACTIONS,
            addOns: marketplace.templates
                .flatMap((listing) => templateViewsOf(id, listing))
                .sort(byKindThenName),
        },
        shown: {
            entry: marketplace.entry,
            actions: MARKETPLACE_SOURCE_ACTIONS.map(({ kind }) => kind),
        },
    };
}

function marketplacesGroupOf(sources: readonly AddOnSourceView[]): AddOnGroupView[] {
    return sources.length === 0
        ? []
        : [{ id: MARKETPLACES_GROUP_ID, ...MARKETPLACES_GROUP_TEXT, sources }];
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

function groupOf(root: string, placed: readonly PlacedAddOn[]): AddOnGroupView[] {
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
                .map(([id, { place, addOns }]) => ({
                    id,
                    kind: place.kind,
                    label: relativeToRoot(place.dir, root) || lastWorkspacePathSegment(place.dir),
                    description: SOURCE_DESCRIPTION[place.kind](place, root),
                    actions: [],
                    addOns: addOns.map(({ view }) => view).sort(byKindThenName),
                })),
        },
    ];
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

function byKindThenName(a: AddOnView, b: AddOnView): number {
    return (
        ADD_ON_KINDS.indexOf(a.kind) - ADD_ON_KINDS.indexOf(b.kind) ||
        compare(a.name, b.name) ||
        compare(a.id, b.id)
    );
}

function optional<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
    return (value === undefined ? {} : { [key]: value }) as { readonly [P in K]?: V };
}

/** By UTF-16 code unit, as `sort()` does, so every host orders alike. */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
