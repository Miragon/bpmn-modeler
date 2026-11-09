import { relativeToWorkspace } from "./rootContainment";

/** Workspace code that runs only once the user allowed this content at this place. */
export interface ApprovableArtifact {
    /** Where the code lives: an approval is for this place, never for a name a repo can copy. */
    readonly id: string;
    readonly name: string;
    /** Covers every byte that can run, so any change to it asks again. */
    readonly contentHash: string;
}

/**
 * The user allowed this content at this place. Kept by the host for the user,
 * outside the workspace, so a repository cannot approve itself. One list holds
 * the rows of every approval kind; the field names are the hosts' stored ones.
 */
export interface CodeApproval {
    readonly pluginId: string;
    readonly contentHash: string;
}

export const CODE_STATES = ["approved", "new", "changed", "declined", "gone"] as const;

export type CodeState = (typeof CODE_STATES)[number];

export type ApprovalState = Extract<CodeState, "approved" | "new" | "changed">;

/** How the approval list and the log name each state, inside a sentence or after a separator. */
export const CODE_STATE_TEXT: Record<CodeState, string> = {
    approved: "allowed",
    new: "new",
    changed: "changed since you allowed it",
    declined: "declined this session",
    gone: "folder gone",
};

/** What a host makes the user do before code it already ran is unloaded; a typed fact, never host prose. */
export const PROCESS_RESTARTS = ["reloadWindow", "restartIde"] as const;

export type ProcessRestart = (typeof PROCESS_RESTARTS)[number];

export const PROCESS_RESTART_TEXT: Record<ProcessRestart, string> = {
    reloadWindow: "reload the window",
    restartIde: "restart the IDE",
};

/** Code at one place as an owner last read it; `unhashed` was read without hashing its content. */
export type CodePresence<A extends ApprovableArtifact = ApprovableArtifact> =
    | { readonly kind: "found"; readonly artifact: A }
    | { readonly kind: "unhashed"; readonly id: string }
    | { readonly kind: "unreadable"; readonly id: string; readonly reason: string }
    | { readonly kind: "gone"; readonly id: string };

/** Code as its owner lists it for a review: what runs, and what else the user may want to know. */
export interface ListedCode extends ApprovableArtifact {
    readonly version?: string;
    /** Every file or folder the content hash covers. */
    readonly files: readonly string[];
}

/** Code as its owner lists it, named even when it could not be read. */
export type ListedPresence = CodePresence<ListedCode> & { readonly name: string };

export type CodeStateReading<S extends CodeState = CodeState> =
    { readonly kind: "state"; readonly state: S } | { readonly kind: "hashNeeded" };

/** Every approval notice offers only this; the list opens from it. */
export type ApprovalNoticeAction = "review";

export interface PendingCodeApproval<A extends ApprovableArtifact> {
    readonly artifact: A;
    readonly state: Exclude<ApprovalState, "approved">;
}

function approvalRowOf(id: string, approvals: readonly CodeApproval[]): CodeApproval | undefined {
    return approvals.find((approval) => approval.pluginId === id);
}

export function approvalStateOf(
    artifact: ApprovableArtifact,
    approvals: readonly CodeApproval[],
): ApprovalState {
    const approval = approvalRowOf(artifact.id, approvals);
    if (approval === undefined) {
        return "new";
    }
    return approval.contentHash === artifact.contentHash ? "approved" : "changed";
}

export function approvedArtifacts<A extends ApprovableArtifact>(
    artifacts: readonly A[],
    approvals: readonly CodeApproval[],
): A[] {
    return artifacts.filter((artifact) => approvalStateOf(artifact, approvals) === "approved");
}

/**
 * One write to the one list, merged by the host into the list it stores, so
 * a writer never drops a row it had not read. Built only through
 * {@link codeApprovalChange}.
 */
export interface CodeApprovalChange {
    readonly allow: readonly CodeApproval[];
    readonly revoke: readonly string[];
}

/** Throws on an id allowed twice, revoked twice, or both allowed and revoked. */
export function codeApprovalChange(
    allow: readonly CodeApproval[],
    revoke: readonly string[],
): CodeApprovalChange {
    const named = new Set<string>();
    for (const id of [...allow.map(({ pluginId }) => pluginId), ...revoke]) {
        if (named.has(id)) {
            throw new Error(`An approval change names an id twice: ${id}`);
        }
        named.add(id);
    }
    return { allow: allow.map(rowOf), revoke: [...revoke] };
}

export function allowing(artifacts: readonly ApprovableArtifact[]): CodeApprovalChange {
    return codeApprovalChange(
        artifacts.map(({ id, contentHash }) => ({ pluginId: id, contentHash })),
        [],
    );
}

export function revoking(ids: readonly string[]): CodeApprovalChange {
    return codeApprovalChange([], ids);
}

/**
 * The stored list after `change`: rows of ids it does not name keep their
 * place, every row of a revoked id drops, an allowed row replaces the first
 * row of its id in place, and new ids append in the order the change names them.
 */
export function approvalsAfter(
    stored: readonly CodeApproval[],
    change: CodeApprovalChange,
): CodeApproval[] {
    const { allow, revoke } = codeApprovalChange(change.allow, change.revoke);
    const revoked = new Set(revoke);
    const pendingAllow = new Map(allow.map((row) => [row.pluginId, row]));
    const allowedIds = new Set(pendingAllow.keys());
    const kept = stored.flatMap((row): CodeApproval[] => {
        if (revoked.has(row.pluginId)) return [];
        if (!allowedIds.has(row.pluginId)) return [rowOf(row)];
        const replacement = pendingAllow.get(row.pluginId);
        pendingAllow.delete(row.pluginId);
        return replacement === undefined ? [] : [replacement];
    });
    return [...kept, ...pendingAllow.values()];
}

/** What turns `before` into `after`; a changed hash counts as allowed. */
export function approvalChangeBetween(
    before: readonly CodeApproval[],
    after: readonly CodeApproval[],
): CodeApprovalChange {
    const beforeById = firstRowById(before);
    const afterById = firstRowById(after);
    return codeApprovalChange(
        [...afterById.values()].filter(
            (row) => beforeById.get(row.pluginId)?.contentHash !== row.contentHash,
        ),
        [...beforeById.keys()].filter((id) => !afterById.has(id)),
    );
}

/**
 * A change of the stored rows as a follower sees it. `withdrawn` names each id
 * whose allowed content no longer is, revoked or allowed at another content:
 * the change alone cannot tell the second from a new allow.
 */
export interface FollowedApprovalChange {
    readonly change: CodeApprovalChange;
    readonly withdrawn: readonly string[];
}

export function followedApprovalChange(
    before: readonly CodeApproval[],
    after: readonly CodeApproval[],
): FollowedApprovalChange {
    const afterById = firstRowById(after);
    return {
        change: approvalChangeBetween(before, after),
        withdrawn: [...firstRowById(before).values()]
            .filter((row) => afterById.get(row.pluginId)?.contentHash !== row.contentHash)
            .map(({ pluginId }) => pluginId),
    };
}

/** Equal for two lists of the same rows in any order. */
export function approvalsKey(approvals: readonly CodeApproval[]): string {
    return JSON.stringify(
        approvals
            .map(({ pluginId, contentHash }) => JSON.stringify([pluginId, contentHash]))
            .sort(),
    );
}

function rowOf({ pluginId, contentHash }: CodeApproval): CodeApproval {
    return { pluginId, contentHash };
}

/** The first row wins, as {@link approvalStateOf} reads it. */
function firstRowById(approvals: readonly CodeApproval[]): Map<string, CodeApproval> {
    const byId = new Map<string, CodeApproval>();
    for (const row of approvals) {
        if (!byId.has(row.pluginId)) byId.set(row.pluginId, rowOf(row));
    }
    return byId;
}

/** Names one version of one artifact, so a decline lasts only until its content changes. */
export function declineKeyOf(artifact: ApprovableArtifact): string {
    return `${artifact.id}#${artifact.contentHash}`;
}

/**
 * Only a row or a decline of the id can match, so code with neither is `new`
 * without reading every byte of it.
 */
export function needsContentHash(
    id: string,
    approvals: readonly CodeApproval[],
    declined: ReadonlySet<string>,
): boolean {
    return (
        approvalRowOf(id, approvals) !== undefined ||
        [...declined].some((key) => isAnswerKeyOf(id, key))
    );
}

function isAnswerKeyOf(id: string, key: string): boolean {
    return key.startsWith(declineKeyOf({ id, name: id, contentHash: "" }));
}

/** An approval of this content wins over a decline of it earlier in the session. */
export function foundCodeState(
    artifact: ApprovableArtifact,
    approvals: readonly CodeApproval[],
    declined: ReadonlySet<string>,
): Exclude<CodeState, "gone"> {
    const state = approvalStateOf(artifact, approvals);
    return state !== "approved" && declined.has(declineKeyOf(artifact)) ? "declined" : state;
}

/** A row decides `changed` for code that cannot be read, so the user still sees what was allowed there. */
export function codeStateOf(
    presence: Exclude<CodePresence, { readonly kind: "gone" }>,
    approvals: readonly CodeApproval[],
    declined: ReadonlySet<string>,
): CodeStateReading<Exclude<CodeState, "gone">>;
export function codeStateOf(
    presence: CodePresence,
    approvals: readonly CodeApproval[],
    declined: ReadonlySet<string>,
): CodeStateReading;
export function codeStateOf(
    presence: CodePresence,
    approvals: readonly CodeApproval[],
    declined: ReadonlySet<string>,
): CodeStateReading {
    switch (presence.kind) {
        case "gone":
            return { kind: "state", state: "gone" };
        case "found":
            return { kind: "state", state: foundCodeState(presence.artifact, approvals, declined) };
        case "unhashed":
            return needsContentHash(presence.id, approvals, declined)
                ? { kind: "hashNeeded" }
                : { kind: "state", state: "new" };
        case "unreadable":
            return {
                kind: "state",
                state: approvalRowOf(presence.id, approvals) === undefined ? "new" : "changed",
            };
    }
}

export type ReviewedAllow =
    | { readonly kind: "allow"; readonly change: CodeApprovalChange }
    | {
          readonly kind: "refused";
          readonly reason: "changedSinceReview" | "gone" | "unreadable";
      };

/**
 * Allows exactly the content the user reviewed, and only while it is still
 * there. `reviewed` comes from what the core itself showed, never from a view's
 * payload; content that cannot be compared is refused.
 */
export function reviewedAllowDecision(
    reviewed: ApprovableArtifact,
    current: CodePresence,
): ReviewedAllow {
    switch (current.kind) {
        case "gone":
        case "unreadable":
            return { kind: "refused", reason: current.kind };
        case "unhashed":
            return { kind: "refused", reason: "changedSinceReview" };
        case "found":
            return current.artifact.id === reviewed.id &&
                current.artifact.contentHash === reviewed.contentHash
                ? { kind: "allow", change: allowing([reviewed]) }
                : { kind: "refused", reason: "changedSinceReview" };
    }
}

export function pendingApprovals<A extends ApprovableArtifact>(
    artifacts: readonly A[],
    approvals: readonly CodeApproval[],
    notAskedAgain: ReadonlySet<string>,
): PendingCodeApproval<A>[] {
    return artifacts.flatMap((artifact) => {
        const state = approvalStateOf(artifact, approvals);
        return state === "approved" || notAskedAgain.has(declineKeyOf(artifact))
            ? []
            : [{ artifact, state }];
    });
}

/** What a session remembers of an answer about one content: {@link declineKeyOf} keys it. */
export const SESSION_ANSWERS = ["declined", "leftForView"] as const;

export type SessionAnswer = (typeof SESSION_ANSWERS)[number];

/** What "Review…" answered: the ids the user checked, or the pending code left to a view. */
export type ReviewAnswer =
    | { readonly kind: "checked"; readonly ids: readonly string[] }
    | { readonly kind: "leftForView" };

export interface CodeApprovalOutcome<A extends ApprovableArtifact> {
    readonly allowed: readonly A[];
    readonly answers: ReadonlyMap<string, SessionAnswer>;
}

/** Unchecked content is declined; content left to a view is neither allowed nor declined. */
export function approvalOutcome<A extends ApprovableArtifact>(
    pending: readonly PendingCodeApproval<A>[],
    answer: ReviewAnswer,
): CodeApprovalOutcome<A> {
    if (answer.kind === "leftForView") {
        return {
            allowed: [],
            answers: new Map(
                pending.map(({ artifact }) => [declineKeyOf(artifact), "leftForView"]),
            ),
        };
    }
    const checked = new Set(answer.ids);
    return {
        allowed: pending
            .filter(({ artifact }) => checked.has(artifact.id))
            .map(({ artifact }) => artifact),
        answers: new Map(
            pending
                .filter(({ artifact }) => !checked.has(artifact.id))
                .map(({ artifact }) => [declineKeyOf(artifact), "declined"]),
        ),
    };
}

/** No notice asks again about content the user declined or left to a view, until it changes. */
export function notAskedAgain(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set(answers.keys());
}

/**
 * Whether some content of `id` was left to a view: no notice asks about it
 * again this session, whatever its content is now, since telling would take
 * a hash a lint should not pay for.
 */
export function isLeftForView(id: string, answers: ReadonlyMap<string, SessionAnswer>): boolean {
    return [...answers].some(([key, answer]) => answer === "leftForView" && isAnswerKeyOf(id, key));
}

/** Content left to a view keeps its state, so only a decline changes what the gate reports. */
export function declinedKeys(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set([...answers].filter(([, answer]) => answer === "declined").map(([key]) => key));
}

/**
 * The folder goes into a list item's `description` rather than its `path`:
 * every host shows a `path` in place of the description, which would hide
 * whether the code changed.
 */
export function pendingApprovalDescription(
    { artifact, state }: PendingCodeApproval<ApprovableArtifact>,
    workspaceFolders: readonly string[],
): string {
    return `${CODE_STATE_TEXT[state]} · ${relativeToWorkspace(artifact.id, workspaceFolders)}`;
}
