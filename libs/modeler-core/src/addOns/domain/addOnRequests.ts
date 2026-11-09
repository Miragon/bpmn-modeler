import { ReviewedAllow } from "../../kernel/domain/codeApproval";
import { CatalogActionKind, TemplateActionKind, TemplateSourceActionKind } from "./addOnIds";

/** What a view asks of the core; every id names something the core itself showed. */
export type AddOnRequest =
    | { readonly kind: "inspect"; readonly addOnId: string }
    | { readonly kind: "allow"; readonly addOnId: string; readonly revision: number }
    | { readonly kind: "revoke"; readonly addOnId: string }
    | { readonly kind: TemplateActionKind; readonly addOnId: string }
    | { readonly kind: "removeMarketplace"; readonly sourceId: string }
    | { readonly kind: TemplateSourceActionKind; readonly sourceId: string }
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

export const UNKNOWN_ADD_ON = refused("unknownAddOn", "This add-on is no longer listed.");
export const NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action for this add-on now. Check it again.",
);
export const CLOSED_VIEW = refused("closedView", "This view is closed.");
export const CATALOG_NOT_OFFERED = refused(
    "notOffered",
    "The list offers no such action now. Check it again.",
);

export const REPORTED_BY_FLOW: AddOnActionResult = { kind: "reportedByFlow" };

/** Why a catalog action the latest build did not offer is refused; `undefined` when it offered it. */
export function catalogActionRefusalOf(
    offered: readonly CatalogActionKind[],
    action: CatalogActionKind,
): AddOnActionResult | undefined {
    return offered.includes(action) ? undefined : CATALOG_NOT_OFFERED;
}

export function refused(reason: AddOnRefusal, message: string): AddOnActionResult {
    return { kind: "refused", reason, message };
}
