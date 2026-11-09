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
import type { ActionView, AddOnReview, CodeAddOnView } from "./addOnCatalogModel";
import { AddOnActionKind, addOnIdOf, CodeAddOnKind } from "./addOnIds";
import { FolderFacts, PlacedAddOn, SOURCE_PLACE, SourcePlace } from "./addOnSourcePlaces";
import {
    ACTION_LABEL,
    ADD_ON_KIND_TEXT,
    allowWarningText,
    cannotBeAllowedText,
    codeStateLabel,
    REVIEW_FACT_LABEL,
    reviewHeading,
} from "./addOnTexts";
import { optional } from "./addOnViewParts";

/** One add-on as its owner read it, placed and spoke of it. */
export interface OwnedPresence {
    readonly presence: ListedPresence;
    /** A plugin's config folder, or the `node_modules` a rule package is installed in. */
    readonly sourceDir: string;
    readonly texts: ApprovableCodeTexts;
}

/** What one listing found of the code add-ons. */
export interface CodeAddOnFacts extends FolderFacts {
    readonly approvals: readonly CodeApproval[];
    readonly plugins: readonly OwnedPresence[];
    readonly rulePackages: readonly OwnedPresence[];
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

interface ListedAddOn extends OwnedPresence {
    readonly kind: CodeAddOnKind;
}

interface StatedAddOn extends ListedAddOn {
    readonly id: string;
    readonly state: CodeState;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

/** A code add-on placed, with what the core showed of it. */
export interface PlacedCode extends PlacedAddOn {
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

/** Each plugin and rule package inside a workspace folder, with its state and the actions it allows. */
export function codeAddOnsOf(
    facts: CodeAddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedCode[] {
    const listed: ListedAddOn[] = [
        ...facts.plugins.map((each) => ({ kind: "plugin" as const, ...each })),
        ...facts.rulePackages.map((each) => ({ kind: "rulePackage" as const, ...each })),
    ];
    return listed.flatMap((each) => placedAddOn(each, facts, session, restart));
}

function placedAddOn(
    listed: ListedAddOn,
    facts: CodeAddOnFacts,
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
