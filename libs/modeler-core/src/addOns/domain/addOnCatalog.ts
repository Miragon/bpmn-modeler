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
import { relativeToRoot, relativeToWorkspace } from "../../kernel/domain/rootContainment";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import { AddOnKind, addOnIdOf, folderGroupIdOf, SourceKind, sourceIdOf } from "./addOnIds";
import { innermostFolderOf } from "./addOnPaths";
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

export const ADD_ON_ACTION_KINDS = ["inspect", "allow", "revoke"] as const;

export type AddOnActionKind = (typeof ADD_ON_ACTION_KINDS)[number];

export const CATALOG_ACTION_KINDS = ["pruneCache"] as const;

export type CatalogActionKind = (typeof CATALOG_ACTION_KINDS)[number];

export interface ActionView<K extends string> {
    readonly kind: K;
    readonly label: string;
}

/** What a view shows: built by the core, rendered by a host, never read back. */
export interface AddOnCatalogModel {
    /** Strictly increasing, across a respawned process too; an allow names the revision it was shown in. */
    readonly revision: number;
    /** Workspace folders in the order they were opened. */
    readonly groups: readonly AddOnGroupView[];
    readonly actions: readonly ActionView<CatalogActionKind>[];
    readonly emptyText?: string;
}

export interface AddOnGroupView {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly sources: readonly AddOnSourceView[];
}

export interface AddOnSourceView {
    readonly id: string;
    readonly kind: SourceKind;
    readonly label: string;
    readonly description: string;
    readonly addOns: readonly AddOnView[];
}

export interface AddOnReview {
    readonly heading: string;
    readonly warning: string;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface AddOnView {
    readonly id: string;
    readonly kind: AddOnKind;
    readonly kindText: string;
    readonly name: string;
    readonly detail?: string;
    readonly state: CodeState;
    readonly stateText: string;
    readonly problem?: string;
    readonly note?: string;
    /** Only for content the user can allow now. */
    readonly review?: AddOnReview;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

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
}

/** What this process remembers beyond the stored approvals, by kind as each owner tells it. */
export interface AddOnSession {
    readonly answers: Readonly<Record<AddOnKind, ReadonlyMap<string, SessionAnswer>>>;
    /** Revoked this session, with code that may still be loaded. */
    readonly stillLoaded: Readonly<Record<AddOnKind, ReadonlySet<string>>>;
}

/** What the core showed of one add-on; kept by the core and never sent. */
export interface ShownCode {
    readonly kind: AddOnKind;
    /** The id its approval row names. */
    readonly id: string;
    readonly name: string;
    /** The content shown, when it was hashed. */
    readonly content?: ApprovableArtifact;
    /** A request is checked against these, so no view acts on a row as it was not shown. */
    readonly actions: readonly AddOnActionKind[];
    readonly allowedFollowUp: string;
    readonly revokedFollowUp: string;
}

export interface CatalogBuild {
    readonly model: AddOnCatalogModel;
    /** By add-on id. */
    readonly shown: ReadonlyMap<string, ShownCode>;
}

interface ListedAddOn extends OwnedPresence {
    readonly kind: AddOnKind;
}

interface PlacedAddOn {
    readonly root: string;
    readonly source: SourcePlace;
    readonly view: AddOnView;
    readonly shown: ShownCode;
}

interface SourcePlace {
    readonly kind: SourceKind;
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

const SOURCE_PLACE: Record<
    AddOnKind,
    (dir: string, root: string, configFolder: string) => SourcePlace
> = {
    plugin: (dir, root, configFolder) => {
        const appliesTo = folderOfConfigFolder(dir, configFolder);
        return { kind: "configFolder", dir, appliesTo, rank: appliesTo === root ? 0 : 1 };
    },
    rulePackage: (dir) => ({ kind: "installedPackages", dir, rank: 2 }),
};

const DETAIL: Record<
    AddOnKind,
    (presence: ListedPresence, sourceDir: string) => string | undefined
> = {
    plugin: (presence, sourceDir) => relativeToRoot(presenceIdOf(presence), sourceDir),
    rulePackage: (presence) => (presence.kind === "found" ? presence.artifact.version : undefined),
};

const SOURCE_DESCRIPTION: Record<SourceKind, (place: SourcePlace, root: string) => string> = {
    installedPackages: () => INSTALLED_PACKAGES_TEXT,
    configFolder: ({ dir, appliesTo }, root) => {
        const belowRoot = relativeToRoot(appliesTo ?? dir, root);
        return belowRoot ? nestedConfigFolderText(belowRoot) : ROOT_CONFIG_FOLDER_TEXT;
    },
};

const CATALOG_ACTIONS: readonly ActionView<CatalogActionKind>[] = [
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
    const placed = listed.flatMap((each) => placedAddOn(each, facts, session, restart));
    const groups = facts.folders.flatMap((root) => groupOf(root, placed));
    return {
        model: {
            revision,
            groups,
            actions: CATALOG_ACTIONS,
            ...emptyTextOf(facts.folders, groups),
        },
        shown: new Map(placed.map(({ view, shown }) => [view.id, shown])),
    };
}

function placedAddOn(
    { kind, presence, sourceDir, texts }: ListedAddOn,
    facts: AddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedAddOn[] {
    const id = presenceIdOf(presence);
    const root = innermostFolderOf(id, facts.folders);
    if (root === undefined) {
        return [];
    }
    const source = SOURCE_PLACE[kind](sourceDir, root, facts.configFolder);
    const reading = codeStateOf(presence, facts.approvals, declinedKeys(session.answers[kind]));
    const state = reading.kind === "state" ? reading.state : "new";
    const actions = CODE_ACTIONS[presence.kind][state] ?? [];
    const content = presence.kind === "found" ? presence.artifact : undefined;
    const view: AddOnView = {
        id: addOnIdOf(kind, id),
        kind,
        kindText: ADD_ON_KIND_TEXT[kind],
        name: presence.name,
        ...optional("detail", DETAIL[kind](presence, source.dir)),
        state,
        stateText: codeStateLabel(state),
        ...optional(
            "problem",
            presence.kind === "unreadable" ? cannotBeAllowedText(presence.reason) : undefined,
        ),
        ...optional(
            "note",
            !isApprovedState(state) && session.stillLoaded[kind].has(id)
                ? texts.revokedFollowUp(restart)
                : undefined,
        ),
        ...optional(
            "review",
            content !== undefined && actions.some((action) => action.kind === "allow")
                ? reviewOf(texts, content, facts.folders)
                : undefined,
        ),
        actions,
    };
    const shown: ShownCode = {
        kind,
        id,
        name: presence.name,
        ...optional(
            "content",
            content === undefined
                ? undefined
                : { id: content.id, name: content.name, contentHash: content.contentHash },
        ),
        actions: actions.map((action) => action.kind),
        allowedFollowUp: texts.allowedFollowUp,
        revokedFollowUp: texts.revokedFollowUp(restart),
    };
    return [{ root, source, view, shown }];
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
                    addOns: addOns
                        .map(({ view }) => view)
                        .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id)),
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
    if (folders.length === 0) return { emptyText: NO_FOLDER_TEXT };
    return groups.length === 0 ? { emptyText: NO_ADD_ON_TEXT } : {};
}

function optional<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
    return (value === undefined ? {} : { [key]: value }) as { readonly [P in K]?: V };
}

/** By UTF-16 code unit, as `sort()` does, so every host orders alike. */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
