import {
    ApprovableArtifact,
    CodeApproval,
    CodeState,
    codeStateOf,
    declinedKeys,
    ListedCode,
    ListedPresence,
    ProcessRestart,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { relativeToRoot, relativeToWorkspace } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath, parentWorkspacePath } from "../../kernel/domain/workspacePath";
import { AddOnKind, addOnIdOf, folderGroupIdOf, SourceKind, sourceIdOf } from "./addOnIds";
import { configSourceDirOf, innermostFolderOf, packagesSourceDirOf } from "./addOnPaths";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    ADD_ON_WARNING_TEXT,
    cannotBeAllowedText,
    codeStateLabel,
    INSTALLED_PACKAGES_TEXT,
    nestedConfigFolderText,
    NO_ADD_ON_TEXT,
    NO_FOLDER_TEXT,
    REVIEW_FACT_LABEL,
    reviewHeading,
    ROOT_CONFIG_FOLDER_TEXT,
    stillLoadedText,
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
    /** Strictly increasing in one process; an allow names the revision it was shown in. */
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

/** What one listing found: every add-on its owner read, by kind. */
export interface AddOnFacts {
    readonly folders: readonly string[];
    readonly configFolder: string;
    readonly approvals: readonly CodeApproval[];
    readonly plugins: readonly ListedPresence[];
    readonly rulePackages: readonly ListedPresence[];
}

/** What this process remembers beyond the stored approvals. */
export interface AddOnSession {
    readonly answers: Readonly<Record<AddOnKind, ReadonlyMap<string, SessionAnswer>>>;
    /** Rule packages whose code may still be loaded although no approval covers it. */
    readonly revokedRulePackages: ReadonlySet<string>;
}

/** What the core showed of one add-on; kept by the core and never sent. */
export interface ShownCode {
    readonly kind: AddOnKind;
    /** The id its approval row names. */
    readonly id: string;
    readonly name: string;
    /** The content shown, when it was hashed. */
    readonly content?: ApprovableArtifact;
}

export interface CatalogBuild {
    readonly model: AddOnCatalogModel;
    /** By add-on id. */
    readonly shown: ReadonlyMap<string, ShownCode>;
}

interface ListedAddOn {
    readonly kind: AddOnKind;
    readonly presence: ListedPresence;
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
    (id: string, root: string, configFolder: string) => SourcePlace
> = {
    plugin: (id, root, configFolder) => {
        const dir = configSourceDirOf(id);
        return {
            kind: "configFolder",
            dir,
            rank: dir === joinWorkspacePath(root, configFolder) ? 0 : 1,
        };
    },
    rulePackage: (id) => ({ kind: "installedPackages", dir: packagesSourceDirOf(id), rank: 2 }),
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
        ...facts.plugins.map((presence) => ({ kind: "plugin" as const, presence })),
        ...facts.rulePackages.map((presence) => ({ kind: "rulePackage" as const, presence })),
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
    { kind, presence }: ListedAddOn,
    facts: AddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedAddOn[] {
    const id = presence.kind === "found" ? presence.artifact.id : presence.id;
    const root = innermostFolderOf(id, facts.folders);
    if (root === undefined) {
        return [];
    }
    const source = SOURCE_PLACE[kind](id, root, facts.configFolder);
    const reading = codeStateOf(presence, facts.approvals, declinedKeys(session.answers[kind]));
    const state = reading.kind === "state" ? reading.state : "new";
    const actions = CODE_ACTIONS[presence.kind][state] ?? [];
    const content = presence.kind === "found" ? presence.artifact : undefined;
    const view: AddOnView = {
        id: addOnIdOf(kind, id),
        kind,
        kindText: ADD_ON_KIND_TEXT[kind],
        name: presence.name,
        ...optional("detail", detailOf(kind, presence, source.dir)),
        state,
        stateText: codeStateLabel(state),
        ...optional(
            "problem",
            presence.kind === "unreadable" ? cannotBeAllowedText(presence.reason) : undefined,
        ),
        ...optional(
            "note",
            kind === "rulePackage" && state !== "approved" && session.revokedRulePackages.has(id)
                ? stillLoadedText(restart)
                : undefined,
        ),
        ...optional(
            "review",
            content !== undefined && actions.some((action) => action.kind === "allow")
                ? reviewOf(kind, content, facts.folders)
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
            label: lastSegmentOf(root),
            description: root,
            sources: [...sources]
                .sort(([idA, a], [idB, b]) => a.place.rank - b.place.rank || compare(idA, idB))
                .map(([id, { place, addOns }]) => ({
                    id,
                    kind: place.kind,
                    label: relativeToRoot(place.dir, root) || lastSegmentOf(place.dir),
                    description: sourceDescriptionOf(place, root),
                    addOns: addOns
                        .map(({ view }) => view)
                        .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id)),
                })),
        },
    ];
}

function sourceDescriptionOf(place: SourcePlace, root: string): string {
    if (place.kind === "installedPackages") {
        return INSTALLED_PACKAGES_TEXT;
    }
    const configParent = parentWorkspacePath(place.dir) ?? place.dir;
    const belowRoot = relativeToRoot(configParent, root);
    return belowRoot ? nestedConfigFolderText(belowRoot) : ROOT_CONFIG_FOLDER_TEXT;
}

function detailOf(
    kind: AddOnKind,
    presence: ListedPresence,
    sourceDir: string,
): string | undefined {
    if (kind === "rulePackage") {
        return presence.kind === "found" ? presence.artifact.version : undefined;
    }
    const id = presence.kind === "found" ? presence.artifact.id : presence.id;
    return relativeToRoot(id, sourceDir);
}

function reviewOf(kind: AddOnKind, content: ListedCode, folders: readonly string[]): AddOnReview {
    const where = (path: string) => relativeToWorkspace(path, folders);
    return {
        heading: reviewHeading(content.name),
        warning: ADD_ON_WARNING_TEXT[kind],
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

function lastSegmentOf(path: string): string {
    return path.split("/").filter(Boolean).pop() ?? path;
}

/** By UTF-16 code unit, as `sort()` does, so every host orders alike. */
function compare(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}
