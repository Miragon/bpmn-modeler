import { ApprovableArtifact, ReviewedAllow } from "../../kernel/domain/codeApproval";
import { ShownCode, ShownSource } from "./addOnCatalog";
import { AddOnActionKind, CatalogActionKind, SourceActionKind } from "./addOnIds";
import { ShownRevisions } from "./shownRevisions";

/** What a view asks of the core; every id names something the core itself showed. */
export type AddOnRequest =
    | { readonly kind: "inspect"; readonly addOnId: string }
    | { readonly kind: "allow"; readonly addOnId: string; readonly revision: number }
    | { readonly kind: "revoke"; readonly addOnId: string }
    | { readonly kind: "removeMarketplace"; readonly sourceId: string }
    | { readonly kind: "addMarketplace" }
    | { readonly kind: "updateMarketplaces" }
    | { readonly kind: "pruneCache" }
    | { readonly kind: "refresh" };

export type AddOnRefusal =
    | "unknownAddOn"
    | "unknownSource"
    | "staleView"
    | "closedView"
    | "notOffered"
    | Extract<ReviewedAllow, { kind: "refused" }>["reason"];

export type AddOnActionResult =
    | { readonly kind: "done"; readonly message?: string }
    | { readonly kind: "refused"; readonly reason: AddOnRefusal; readonly message: string }
    | { readonly kind: "failed"; readonly message: string }
    /** The marketplace flow asked and reported on its own. */
    | { readonly kind: "reportedByFlow" };

export type AllowTarget =
    | { readonly kind: "reviewed"; readonly code: ShownCode; readonly content: ApprovableArtifact }
    | { readonly kind: "refused"; readonly result: AddOnActionResult };

export type ShownSourceTarget =
    | { readonly kind: "shown"; readonly source: ShownSource }
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
const UNKNOWN_SOURCE = refused("unknownSource", "This marketplace is no longer listed.");
const SOURCE_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this source now. Check it again.",
);
export const CATALOG_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action now. Check it again.",
);

export const REPORTED_BY_FLOW: AddOnActionResult = { kind: "reportedByFlow" };

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

/** Only an action the latest build offered for the source, on the entry it showed. */
export function shownSourceTargetOf(
    sources: ReadonlyMap<string, ShownSource>,
    sourceId: string,
    action: SourceActionKind,
): ShownSourceTarget {
    const source = sources.get(sourceId);
    if (source === undefined) {
        return { kind: "refused", result: UNKNOWN_SOURCE };
    }
    return source.actions.includes(action)
        ? { kind: "shown", source }
        : { kind: "refused", result: SOURCE_NOT_OFFERED };
}

/** Why a catalog action the latest build did not offer is refused; `undefined` when it offered it. */
export function catalogActionRefusalOf(
    offered: readonly CatalogActionKind[],
    action: CatalogActionKind,
): AddOnActionResult | undefined {
    return offered.includes(action) ? undefined : CATALOG_NOT_OFFERED;
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

function refused(reason: AddOnRefusal, message: string): AddOnActionResult {
    return { kind: "refused", reason, message };
}
