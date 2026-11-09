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

export type ApprovalState = "approved" | "new" | "changed";

/** Every approval notice offers only this; the list opens from it. */
export type ApprovalNoticeAction = "review";

export interface PendingCodeApproval<A extends ApprovableArtifact> {
    readonly artifact: A;
    readonly state: Exclude<ApprovalState, "approved">;
}

export function approvalStateOf(
    artifact: ApprovableArtifact,
    approvals: readonly CodeApproval[],
): ApprovalState {
    const approval = approvals.find((each) => each.pluginId === artifact.id);
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

export function pendingApprovals<A extends ApprovableArtifact>(
    artifacts: readonly A[],
    approvals: readonly CodeApproval[],
    declinedThisSession: ReadonlySet<string>,
): PendingCodeApproval<A>[] {
    return artifacts.flatMap((artifact) => {
        const state = approvalStateOf(artifact, approvals);
        return state === "approved" || declinedThisSession.has(declineKeyOf(artifact))
            ? []
            : [{ artifact, state }];
    });
}

export interface CodeApprovalOutcome<A extends ApprovableArtifact> {
    readonly allowed: readonly A[];
    /** {@link declineKeyOf} of each artifact left unchecked; a dismissal leaves all of them. */
    readonly declineKeys: readonly string[];
}

export function approvalOutcome<A extends ApprovableArtifact>(
    pending: readonly PendingCodeApproval<A>[],
    checkedIds: readonly string[],
): CodeApprovalOutcome<A> {
    const checked = new Set(checkedIds);
    return {
        allowed: pending
            .filter(({ artifact }) => checked.has(artifact.id))
            .map(({ artifact }) => artifact),
        declineKeys: pending
            .filter(({ artifact }) => !checked.has(artifact.id))
            .map(({ artifact }) => declineKeyOf(artifact)),
    };
}

/** How the approval list and the log name each pending state. */
export const PENDING_APPROVAL_STATE_TEXT: Record<
    PendingCodeApproval<ApprovableArtifact>["state"],
    string
> = {
    new: "new",
    changed: "changed since you allowed it",
};

/**
 * The folder goes into a list item's `description` rather than its `path`:
 * every host shows a `path` in place of the description, which would hide
 * whether the code changed.
 */
export function pendingApprovalDescription(
    { artifact, state }: PendingCodeApproval<ApprovableArtifact>,
    workspaceFolders: readonly string[],
): string {
    return `${PENDING_APPROVAL_STATE_TEXT[state]} · ${relativeToWorkspace(artifact.id, workspaceFolders)}`;
}
