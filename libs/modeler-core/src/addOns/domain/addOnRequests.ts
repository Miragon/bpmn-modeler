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

export const REQUEST_FAILED: AddOnActionResult = {
    kind: "failed",
    message: "Could not do this. The log says why.",
};

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

type RequestField = "addOnId" | "sourceId" | "revision";

const REQUEST_FIELDS: Record<AddOnRequest["kind"], readonly RequestField[]> = {
    inspect: ["addOnId"],
    allow: ["addOnId", "revision"],
    revoke: ["addOnId"],
    enable: ["addOnId"],
    disable: ["addOnId"],
    removeMarketplace: ["sourceId"],
    enableTemplates: ["sourceId"],
    disableTemplates: ["sourceId"],
    addMarketplace: [],
    updateMarketplaces: [],
    pruneCache: [],
    refresh: [],
};

const IS_FIELD_VALUE: Record<RequestField, (value: unknown) => boolean> = {
    addOnId: (value) => typeof value === "string",
    sourceId: (value) => typeof value === "string",
    revision: (value) => Number.isSafeInteger(value),
};

/**
 * A view's request in a shape the core knows, with only the fields its kind
 * names; `undefined` for anything else, since it reached the core as
 * untrusted data. Ids stay opaque: only a lookup in what the core showed
 * gives them a meaning.
 */
export function addOnRequestOf(value: unknown): AddOnRequest | undefined {
    if (
        !isRecord(value) ||
        typeof value.kind !== "string" ||
        !Object.prototype.hasOwnProperty.call(REQUEST_FIELDS, value.kind)
    ) {
        return undefined;
    }
    const fields = REQUEST_FIELDS[value.kind as AddOnRequest["kind"]];
    if (!fields.every((field) => IS_FIELD_VALUE[field](value[field]))) {
        return undefined;
    }
    return Object.fromEntries([
        ["kind", value.kind],
        ...fields.map((field) => [field, value[field]]),
    ]) as AddOnRequest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
