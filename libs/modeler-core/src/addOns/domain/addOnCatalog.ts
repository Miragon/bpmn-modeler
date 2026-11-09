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
    CodeAddOnView,
} from "./addOnCatalogModel";
import {
    AddOnActionKind,
    addOnIdOf,
    CatalogActionKind,
    CodeAddOnKind,
    folderGroupIdOf,
    sourceIdOf,
} from "./addOnIds";
import {
    FolderFacts,
    FolderSourceKind,
    PlacedAddOn,
    SOURCE_PLACE,
    sourceLabelOf,
    SourcePlace,
} from "./addOnSourcePlaces";
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
import { TemplateAddOnFacts, templateAddOnsOf } from "./templateAddOnCatalog";
import { ShownSource, ShownTemplate, SourceSwitchView } from "./templateAddOnViews";

/** One add-on as its owner read it, placed and spoke of it. */
export interface OwnedPresence {
    readonly presence: ListedPresence;
    /** A plugin's config folder, or the `node_modules` a rule package is installed in. */
    readonly sourceDir: string;
    readonly texts: ApprovableCodeTexts;
}

/** What one listing found of the code add-ons. */
interface CodeAddOnFacts extends FolderFacts {
    readonly approvals: readonly CodeApproval[];
    readonly plugins: readonly OwnedPresence[];
    readonly rulePackages: readonly OwnedPresence[];
}

/** What one listing found: every add-on its owner read, by kind. */
export type AddOnFacts = CodeAddOnFacts & TemplateAddOnFacts;

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

interface PlacedCode extends PlacedAddOn {
    readonly shown: ShownCode;
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
    const code = listed.flatMap((each) => placedAddOn(each, facts, session, restart));
    const templates = templateAddOnsOf(facts);
    const placed = [...code, ...templates.placed];
    const groups = [
        ...facts.folders.flatMap((root) => groupOf(root, placed, templates.folderSwitches)),
        ...templates.marketplacesGroup,
    ];
    const actions = [...templates.marketplaceActions, ...PRUNE_ACTIONS];
    return {
        model: { revision, groups, actions, ...emptyTextOf(facts.folders, groups) },
        shown: new Map(code.map(({ view, shown }) => [view.id, shown])),
        sources: templates.sources,
        templates: templates.templates,
        catalogActions: actions.map(({ kind }) => kind),
    };
}

function placedAddOn(
    listed: ListedAddOn,
    facts: AddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedCode[] {
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
