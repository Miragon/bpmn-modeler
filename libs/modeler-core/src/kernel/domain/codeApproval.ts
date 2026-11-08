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
export interface PluginApproval {
    readonly pluginId: string;
    readonly contentHash: string;
}

export type ApprovalState = "approved" | "new" | "changed";

export interface PendingCodeApproval<A extends ApprovableArtifact> {
    readonly artifact: A;
    readonly state: Exclude<ApprovalState, "approved">;
}

export function approvalStateOf(
    artifact: ApprovableArtifact,
    approvals: readonly PluginApproval[],
): ApprovalState {
    const approval = approvals.find((each) => each.pluginId === artifact.id);
    if (approval === undefined) {
        return "new";
    }
    return approval.contentHash === artifact.contentHash ? "approved" : "changed";
}

export function approvedArtifacts<A extends ApprovableArtifact>(
    artifacts: readonly A[],
    approvals: readonly PluginApproval[],
): A[] {
    return artifacts.filter((artifact) => approvalStateOf(artifact, approvals) === "approved");
}

export function approvalsAllowing(
    approvals: readonly PluginApproval[],
    allowed: readonly ApprovableArtifact[],
): PluginApproval[] {
    const allowedIds = new Set(allowed.map((artifact) => artifact.id));
    return [
        ...approvals.filter((approval) => !allowedIds.has(approval.pluginId)),
        ...allowed.map((artifact) => ({
            pluginId: artifact.id,
            contentHash: artifact.contentHash,
        })),
    ];
}

export function approvalsRevoking(
    approvals: readonly PluginApproval[],
    revokedIds: readonly string[],
): PluginApproval[] {
    const revoked = new Set(revokedIds);
    return approvals.filter((approval) => !revoked.has(approval.pluginId));
}

/** Names one version of one artifact, so a decline lasts only until its content changes. */
export function declineKeyOf(artifact: ApprovableArtifact): string {
    return `${artifact.id}#${artifact.contentHash}`;
}

export function pendingApprovals<A extends ApprovableArtifact>(
    artifacts: readonly A[],
    approvals: readonly PluginApproval[],
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
