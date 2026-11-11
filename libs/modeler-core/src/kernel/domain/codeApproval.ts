/**
 * A row the user allowed: an allowance of an add-on, or, as 1.21.0 stored
 * every row, the content found at one place. Kept by the host for the user,
 * outside the workspace, so a repository cannot approve itself. One list
 * holds the rows of every approval kind; the field names are the hosts' stored ones.
 */
export interface CodeApproval {
    readonly pluginId: string;
    readonly contentHash: string;
}

/**
 * The states the add-ons view protocol names. No reading produces `changed`
 * or `gone` any more; they stay until the protocol narrows them.
 */
export type CodeState = "approved" | "new" | "changed" | "declined" | "gone";

/** What a host makes the user do before code it already ran is unloaded; a typed fact, never host prose. */
export const PROCESS_RESTARTS = ["reloadWindow", "restartIde"] as const;

export type ProcessRestart = (typeof PROCESS_RESTARTS)[number];

export const PROCESS_RESTART_TEXT: Record<ProcessRestart, string> = {
    reloadWindow: "reload the window",
    restartIde: "restart the IDE",
};

/** What an owner says of its code: what it can do once allowed, and what follows an allow or a revoke. */
export interface ApprovableCodeTexts {
    readonly risk: string;
    readonly allowedFollowUp: string;
    /** Also the note of a row whose code its owner says stays loaded after a revoke. */
    readonly revokedFollowUp: (restart: ProcessRestart) => string;
}

/** Every approval notice offers only this; the list opens from it. */
export type ApprovalNoticeAction = "review";

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

/** The first row of an id wins, as the hosts merge a change into it. */
function firstRowById(approvals: readonly CodeApproval[]): Map<string, CodeApproval> {
    const byId = new Map<string, CodeApproval>();
    for (const row of approvals) {
        if (!byId.has(row.pluginId)) byId.set(row.pluginId, rowOf(row));
    }
    return byId;
}

/** What a session remembers of an answer about one allowance: `allowanceKeyOf` keys it. */
export const SESSION_ANSWERS = ["declined", "leftForView"] as const;

export type SessionAnswer = (typeof SESSION_ANSWERS)[number];

/** What "Review…" answered: the ids the user checked, or the pending code left to a view. */
export type ReviewAnswer =
    | { readonly kind: "checked"; readonly ids: readonly string[] }
    | { readonly kind: "leftForView" };

/** No notice asks again about an allowance the user declined or left to a view. */
export function notAskedAgain(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set(answers.keys());
}

/** An allowance left to a view keeps its state, so only a decline changes what the gate reports. */
export function declinedKeys(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set([...answers].filter(([, answer]) => answer === "declined").map(([key]) => key));
}
