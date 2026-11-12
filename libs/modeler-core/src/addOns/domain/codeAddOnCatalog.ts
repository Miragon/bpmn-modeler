import {
    Allowance,
    allowanceKeyOf,
    AllowanceState,
    allowanceStateOf,
} from "../../kernel/domain/allowance";
import {
    ApprovableCodeTexts,
    CodeApproval,
    CodeState,
    declinedKeys,
    ProcessRestart,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { ListedCode, ListedPresence, presenceIdOf } from "../../kernel/domain/listedCode";
import { offersAllowInWorkspace } from "../../kernel/domain/workspaceTrust";
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
    allowedInText,
    allowWarningText,
    cannotBeAllowedText,
    CODE_STATE_LABEL,
    REVIEW_FACT_LABEL,
    reviewHeading,
    UNTRUSTED_WORKSPACE_TEXT,
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
    /** Whether the user trusts the workspace; untrusted, no code add-on runs or offers Allow. */
    readonly trusted: boolean;
    /** The stored rows of each kind, so a kind's rules never read another kind's rows. */
    readonly approvalsByKind: Readonly<Record<CodeAddOnKind, readonly CodeApproval[]>>;
    readonly plugins: readonly OwnedPresence[];
    readonly rulePackages: readonly OwnedPresence[];
}

/** What this process remembers beyond the stored approvals, by kind as each owner tells it. */
export interface AddOnSession {
    /** By `allowanceKeyOf`. */
    readonly answers: Readonly<Record<CodeAddOnKind, ReadonlyMap<string, SessionAnswer>>>;
    /** Revoked this session, with code that may still be loaded: allowance keys and places. */
    readonly stillLoaded: Readonly<Record<CodeAddOnKind, ReadonlySet<string>>>;
}

/** What the core showed of one add-on; kept by the core and never sent. */
export interface ShownCode {
    readonly kind: CodeAddOnKind;
    /** The place it was found at. */
    readonly id: string;
    readonly name: string;
    /** What Allow and Revoke act on, as the row showed it. */
    readonly allowance: Allowance;
    /** A request is checked against these, so no view acts on a row as it was not shown. */
    readonly actions: readonly AddOnActionKind[];
    readonly allowedFollowUp: string;
    readonly revokedFollowUp: string;
}

type ListedKind = Exclude<ListedPresence["kind"], "gone">;

type ListablePresence = Extract<ListedPresence, { kind: ListedKind }>;

interface ListedAddOn extends OwnedPresence {
    readonly kind: CodeAddOnKind;
    readonly presence: ListablePresence;
}

interface StatedAddOn extends ListedAddOn {
    readonly id: string;
    readonly allowance: Allowance;
    readonly state: AllowanceState;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

/** A code add-on placed, with what the core showed of it. */
export interface PlacedCode extends PlacedAddOn {
    readonly shown: ShownCode;
}

const VIEW_STATE: Record<AllowanceState, CodeState> = {
    allowed: "approved",
    new: "new",
    declined: "declined",
};

const ALLOW: readonly ActionView<AddOnActionKind>[] = [
    { kind: "allow", label: ACTION_LABEL.allow },
];
const REVOKE: readonly ActionView<AddOnActionKind>[] = [
    { kind: "revoke", label: ACTION_LABEL.revoke },
];

const NO_ALLOW: Record<AllowanceState, readonly ActionView<AddOnActionKind>[]> = {
    allowed: REVOKE,
    new: [],
    declined: [],
};

/** Code that cannot be read offers no Allow; its problem says why. */
const CODE_ACTIONS: Record<
    ListedKind,
    Record<AllowanceState, readonly ActionView<AddOnActionKind>[]>
> = {
    found: { allowed: REVOKE, new: ALLOW, declined: ALLOW },
    unreadable: NO_ALLOW,
};

function codeActionsOf(
    kind: ListedKind,
    state: AllowanceState,
    trusted: boolean,
): readonly ActionView<AddOnActionKind>[] {
    return (offersAllowInWorkspace(trusted) ? CODE_ACTIONS[kind] : NO_ALLOW)[state];
}

const DETAIL: Record<
    CodeAddOnKind,
    (presence: ListablePresence, sourceDir: string) => string | undefined
> = {
    plugin: (presence, sourceDir) => relativeToRoot(presenceIdOf(presence), sourceDir),
    // Its name carries the version.
    rulePackage: () => undefined,
};

/** Each plugin and rule package inside a workspace folder, with its state and the actions it allows. */
export function codeAddOnsOf(
    facts: CodeAddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedCode[] {
    const listed: ListedAddOn[] = [
        ...facts.plugins.flatMap((each) => listedOf("plugin", each)),
        ...facts.rulePackages.flatMap((each) => listedOf("rulePackage", each)),
    ];
    return listed.flatMap((each) => {
        const root = innermostFolderOf(presenceIdOf(each.presence), facts.folders);
        return root === undefined ? [] : [placedAddOn({ ...each, root }, facts, session, restart)];
    });
}

function listedOf(kind: CodeAddOnKind, owned: OwnedPresence): ListedAddOn[] {
    const { presence } = owned;
    return presence.kind === "gone" ? [] : [{ ...owned, kind, presence }];
}

function allowanceOfPresence(presence: ListablePresence): Allowance {
    return presence.kind === "found" ? presence.artifact.allowance : presence.allowance;
}

function placedAddOn(
    listed: ListedAddOn & { readonly root: string },
    facts: CodeAddOnFacts,
    session: AddOnSession,
    restart: ProcessRestart,
): PlacedCode {
    const { kind, presence, sourceDir, root } = listed;
    const id = presenceIdOf(presence);
    const allowance = allowanceOfPresence(presence);
    const source = SOURCE_PLACE[kind](sourceDir, root, facts.configFolder);
    const state = allowanceStateOf(
        { id, allowance },
        facts.approvalsByKind[kind],
        declinedKeys(session.answers[kind]),
    );
    const row: StatedAddOn = {
        ...listed,
        id,
        allowance,
        state,
        actions: codeActionsOf(presence.kind, state, facts.trusted),
    };
    return {
        root,
        source,
        view: viewOf(row, source, facts, session, restart),
        shown: shownOf(row, restart),
    };
}

function viewOf(
    row: StatedAddOn,
    source: SourcePlace,
    { folders, trusted }: Pick<CodeAddOnFacts, "folders" | "trusted">,
    session: AddOnSession,
    restart: ProcessRestart,
): CodeAddOnView {
    const { kind, presence, id, state, actions } = row;
    const viewState = VIEW_STATE[state];
    return {
        id: addOnIdOf(kind, id),
        kind,
        kindText: ADD_ON_KIND_TEXT[kind],
        name: presence.name,
        ...optional("detail", DETAIL[kind](presence, source.dir)),
        state: viewState,
        stateText: CODE_STATE_LABEL[viewState],
        ...optional("problem", problemOf(presence, trusted)),
        ...optional("note", noteOf(row, session, restart)),
        ...optional("review", reviewOfRow(row, folders)),
        actions,
    };
}

function problemOf(presence: ListablePresence, trusted: boolean): string | undefined {
    if (presence.kind === "unreadable") return cannotBeAllowedText(presence.reason);
    return offersAllowInWorkspace(trusted) ? undefined : UNTRUSTED_WORKSPACE_TEXT;
}

function noteOf(
    { kind, id, allowance, state, texts }: StatedAddOn,
    session: AddOnSession,
    restart: ProcessRestart,
): string | undefined {
    const stillLoaded = session.stillLoaded[kind];
    const revoked = stillLoaded.has(allowanceKeyOf(allowance)) || stillLoaded.has(id);
    return state !== "allowed" && revoked ? texts.revokedFollowUp(restart) : undefined;
}

function reviewOfRow(
    { presence, texts, actions }: StatedAddOn,
    folders: readonly string[],
): AddOnReview | undefined {
    return presence.kind === "found" && offers(actions, "allow")
        ? reviewOf(texts, presence.name, presence.artifact, folders)
        : undefined;
}

function shownOf(row: StatedAddOn, restart: ProcessRestart): ShownCode {
    const { kind, id, presence, allowance, texts, actions } = row;
    return {
        kind,
        id,
        name: presence.name,
        allowance,
        actions: actions.map((action) => action.kind),
        allowedFollowUp: texts.allowedFollowUp,
        revokedFollowUp: texts.revokedFollowUp(restart),
    };
}

function offers(actions: readonly ActionView<AddOnActionKind>[], kind: AddOnActionKind): boolean {
    return actions.some((action) => action.kind === kind);
}

function reviewOf(
    texts: ApprovableCodeTexts,
    name: string,
    code: ListedCode,
    folders: readonly string[],
): AddOnReview {
    return {
        heading: reviewHeading(name),
        warning: allowWarningText(texts.risk, code.allowance),
        facts: [
            { label: REVIEW_FACT_LABEL.folder, value: relativeToWorkspace(code.id, folders) },
            ...(code.version === undefined
                ? []
                : [{ label: REVIEW_FACT_LABEL.version, value: code.version }]),
            { label: REVIEW_FACT_LABEL.allowedIn, value: allowedInText(code.allowance) },
        ],
    };
}
