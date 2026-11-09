import {
    ApprovableArtifact,
    ProcessRestart,
    ReviewedAllow,
} from "../../kernel/domain/codeApproval";
import { AddOnActionKind, ShownCode } from "./addOnCatalog";
import { AddOnKind } from "./addOnIds";
import { stillLoadedText } from "./addOnTexts";
import { ShownRevisions } from "./shownRevisions";

/** What a view asks of the core; every id names something the core itself showed. */
export type AddOnRequest =
    | { readonly kind: "inspect"; readonly addOnId: string }
    | { readonly kind: "allow"; readonly addOnId: string; readonly revision: number }
    | { readonly kind: "revoke"; readonly addOnId: string }
    | { readonly kind: "pruneCache" }
    | { readonly kind: "refresh" };

export type AddOnRefusal =
    | "unknownAddOn"
    | "staleView"
    | "closedView"
    | "notOffered"
    | Extract<ReviewedAllow, { kind: "refused" }>["reason"];

export type AddOnActionResult =
    | { readonly kind: "done"; readonly message?: string }
    | { readonly kind: "refused"; readonly reason: AddOnRefusal; readonly message: string };

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
const UNKNOWN_ADD_ON = refused("unknownAddOn", "This add-on is no longer listed.");
const NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this add-on now. Check it again.",
);
export const CLOSED_VIEW = refused("closedView", "This view is closed.");

const REVOKED_FOLLOW_UP: Record<AddOnKind, (restart: ProcessRestart) => string> = {
    plugin: () => "Open editors reload without it.",
    rulePackage: stillLoadedText,
};

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
    action: Exclude<AddOnActionKind, "allow">,
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

export function revokeResultOf(code: ShownCode, restart: ProcessRestart): AddOnActionResult {
    return {
        kind: "done",
        message: `Revoked ${code.name}. ${REVOKED_FOLLOW_UP[code.kind](restart)}`,
    };
}

export function inspectResultOf(code: ShownCode): AddOnActionResult {
    return {
        kind: "done",
        message: `Read ${code.name}. Review what it covers, then allow this content.`,
    };
}

export function pruneResultOf(removed: number): AddOnActionResult {
    const message =
        removed === 0
            ? "No unused plugin copies to remove."
            : `Removed ${removed} unused plugin ${removed === 1 ? "copy" : "copies"}.`;
    return { kind: "done", message };
}

function refused(reason: AddOnRefusal, message: string): AddOnActionResult {
    return { kind: "refused", reason, message };
}
