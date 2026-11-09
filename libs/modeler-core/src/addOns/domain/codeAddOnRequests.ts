import { ApprovableArtifact, ReviewedAllow } from "../../kernel/domain/codeApproval";
import { ShownCode } from "./addOnCatalog";
import { AddOnActionKind } from "./addOnIds";
import { AddOnActionResult, NOT_OFFERED, refused, UNKNOWN_ADD_ON } from "./addOnRequests";
import { ShownRevisions } from "./shownRevisions";

export type AllowTarget =
    | { readonly kind: "reviewed"; readonly code: ShownCode; readonly content: ApprovableArtifact }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

export type ShownTarget =
    | { readonly kind: "shown"; readonly code: ShownCode }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

const STALE_VIEW = refused(
    "staleView",
    "The list changed since you looked at it. Check it again, then allow.",
);

const REFUSED_ALLOW_TEXT: Record<
    Extract<ReviewedAllow, { kind: "refused" }>["reason"],
    (name: string) => string
> = {
    changedSinceReview: (name) =>
        `${name} changed after you reviewed it. Review it again, then allow.`,
    gone: (name) => `${name} is gone.`,
    unreadable: (name) => `${name} can no longer be read.`,
};

/** Only the content the named revision showed can be allowed, whatever is listed now. */
export function allowTargetOf(
    revisions: ShownRevisions,
    revision: number,
    addOnId: string,
): AllowTarget {
    const shown = revisions.shownAt(revision);
    if (shown === undefined) {
        return { kind: "refused", result: STALE_VIEW };
    }
    const target = offeredTargetOf(shown, addOnId, "allow");
    if (target.kind === "refused") {
        return target;
    }
    const { code } = target;
    return code.content === undefined
        ? { kind: "refused", result: STALE_VIEW }
        : { kind: "reviewed", code, content: code.content };
}

/** Only an action the latest revision offered for the add-on. */
export function shownTargetOf(
    revisions: ShownRevisions,
    addOnId: string,
    action: Extract<AddOnActionKind, "inspect" | "revoke">,
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

export function allowResultOf(code: ShownCode, decision: ReviewedAllow): AddOnActionResult {
    if (decision.kind === "refused") {
        return refused(decision.reason, REFUSED_ALLOW_TEXT[decision.reason](code.name));
    }
    return { kind: "done", message: `Allowed ${code.name}. ${code.allowedFollowUp}` };
}

export function revokeResultOf(code: ShownCode): AddOnActionResult {
    return { kind: "done", message: `Revoked ${code.name}. ${code.revokedFollowUp}` };
}

export function inspectResultOf(code: ShownCode): AddOnActionResult {
    return {
        kind: "done",
        message: `Read ${code.name}. Review what it covers, then allow this content.`,
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
