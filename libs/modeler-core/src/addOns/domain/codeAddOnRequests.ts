import { Allowance, allowanceKeyOf, allowingAllowances } from "../../kernel/domain/allowance";
import { CodeApprovalChange } from "../../kernel/domain/codeApproval";
import { ListedPresence } from "../../kernel/domain/listedCode";
import { ShownCode } from "./codeAddOnCatalog";
import { AddOnActionKind } from "./addOnIds";
import { AddOnActionResult, NOT_OFFERED, refused, UNKNOWN_ADD_ON } from "./addOnRequests";
import { ShownRevisions } from "./shownRevisions";

export type ShownTarget =
    | { readonly kind: "shown"; readonly code: ShownCode }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

export type AllowDecision =
    | { readonly kind: "allow"; readonly change: CodeApprovalChange }
    | { readonly kind: "refused"; readonly reason: "gone" | "unreadable" | "staleView" };

const STALE_VIEW = refused(
    "staleView",
    "The list changed since you looked at it. Check it again, then allow.",
);

const REFUSED_ALLOW_TEXT: Record<"gone" | "unreadable", (name: string) => string> = {
    gone: (name) => `${name} is gone.`,
    unreadable: (name) => `${name} can no longer be read.`,
};

const SCOPE_TEXT: Record<Allowance["origin"]["kind"], string> = {
    repository: " in every worktree of its repository",
    folder: "",
};

/** Only an add-on the named revision offered Allow for, whatever is listed now. */
export function allowTargetOf(
    revisions: ShownRevisions,
    revision: number,
    addOnId: string,
): ShownTarget {
    const shown = revisions.shownAt(revision);
    if (shown === undefined) {
        return { kind: "refused", result: STALE_VIEW };
    }
    return offeredTargetOf(shown, addOnId, "allow");
}

/** Only an action the latest revision offered for the add-on. */
export function shownTargetOf(
    revisions: ShownRevisions,
    addOnId: string,
    action: Extract<AddOnActionKind, "revoke">,
): ShownTarget {
    return offeredTargetOf(revisions.latest(), addOnId, action);
}

function offeredTargetOf(
    shown: ReadonlyMap<string, ShownCode>,
    addOnId: string,
    action: AddOnActionKind,
): ShownTarget {
    const code = shown.get(addOnId);
    if (code === undefined) {
        return { kind: "refused", result: UNKNOWN_ADD_ON };
    }
    return code.actions.includes(action)
        ? { kind: "shown", code }
        : { kind: "refused", result: NOT_OFFERED };
}

/** Allows the allowance the row showed, unless its place now resolves to another one. */
export function allowDecisionOf(code: ShownCode, current: ListedPresence): AllowDecision {
    if (current.kind !== "found") {
        return { kind: "refused", reason: current.kind };
    }
    if (allowanceKeyOf(current.artifact.allowance) !== allowanceKeyOf(code.allowance)) {
        return { kind: "refused", reason: "staleView" };
    }
    return { kind: "allow", change: allowingAllowances([code]) };
}

export function allowResultOf(code: ShownCode, decision: AllowDecision): AddOnActionResult {
    if (decision.kind === "refused") {
        return decision.reason === "staleView"
            ? STALE_VIEW
            : refused(decision.reason, REFUSED_ALLOW_TEXT[decision.reason](code.name));
    }
    return {
        kind: "done",
        message: `Allowed ${code.name}${SCOPE_TEXT[code.allowance.origin.kind]}. ${code.allowedFollowUp}`,
    };
}

export function revokeResultOf(code: ShownCode): AddOnActionResult {
    return {
        kind: "done",
        message: `Revoked ${code.name}${SCOPE_TEXT[code.allowance.origin.kind]}. ${code.revokedFollowUp}`,
    };
}

export const PRUNE_FAILED: AddOnActionResult = {
    kind: "failed",
    message: "Could not remove the unused plugin copies. The log says why.",
};

export function pruneResultOf(removed: number): AddOnActionResult {
    const message =
        removed === 0
            ? "No unused plugin copies to remove."
            : `Removed ${removed} unused plugin ${removed === 1 ? "copy" : "copies"}.`;
    return { kind: "done", message };
}
