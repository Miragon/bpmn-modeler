import { Command, Query } from "./messages";

/*
 * Copies of the core's add-on catalog model, request and result, field for
 * field: the core's types sit behind the package boundary. The spec of the
 * core's protocol adapter pins each copy to its home.
 */

export type CodeStatePayload = "approved" | "new" | "changed" | "declined" | "gone";

export type TemplateStatePayload = "enabled" | "disabled";

export type SourceKindPayload = "configFolder" | "installedPackages" | "marketplace";

export type CodeAddOnKindPayload = "plugin" | "rulePackage";

export type AddOnActionKindPayload = "inspect" | "allow" | "revoke" | "enable" | "disable";

export type SourceActionKindPayload = "removeMarketplace" | "enableTemplates" | "disableTemplates";

export type CatalogActionKindPayload = "addMarketplace" | "updateMarketplaces" | "pruneCache";

export type AddOnRefusalPayload =
    | "unknownAddOn"
    | "unknownSource"
    | "staleView"
    | "closedView"
    | "notOffered"
    | "changedSinceReview"
    | "gone"
    | "unreadable";

export interface ActionViewPayload<K extends string> {
    readonly kind: K;
    readonly label: string;
}

export interface AddOnCatalogPayload {
    readonly revision: number;
    readonly groups: readonly AddOnGroupPayload[];
    readonly actions: readonly ActionViewPayload<CatalogActionKindPayload>[];
    readonly emptyText?: string;
    readonly problem?: string;
}

export interface AddOnGroupPayload {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly problem?: string;
    readonly sources: readonly AddOnSourcePayload[];
}

export interface AddOnSourcePayload {
    readonly id: string;
    readonly kind: SourceKindPayload;
    readonly label: string;
    readonly description: string;
    readonly problem?: string;
    readonly stateText?: string;
    readonly actions: readonly ActionViewPayload<SourceActionKindPayload>[];
    readonly addOns: readonly AddOnPayload[];
}

export interface AddOnReviewPayload {
    readonly heading: string;
    readonly warning: string;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface CodeAddOnPayload {
    readonly id: string;
    readonly kind: CodeAddOnKindPayload;
    readonly kindText: string;
    readonly name: string;
    readonly detail?: string;
    readonly state: CodeStatePayload;
    readonly stateText: string;
    readonly problem?: string;
    readonly note?: string;
    readonly review?: AddOnReviewPayload;
    readonly actions: readonly ActionViewPayload<AddOnActionKindPayload>[];
}

export interface TemplateAddOnPayload {
    readonly id: string;
    readonly kind: "elementTemplate";
    readonly kindText: string;
    readonly name: string;
    readonly detail?: string;
    readonly engineText?: string;
    readonly state: TemplateStatePayload;
    readonly stateText: string;
    readonly problem?: string;
    readonly note?: string;
    readonly actions: readonly ActionViewPayload<AddOnActionKindPayload>[];
}

export type AddOnPayload = CodeAddOnPayload | TemplateAddOnPayload;

export type AddOnRequestPayload =
    | { readonly kind: "inspect"; readonly addOnId: string }
    | { readonly kind: "allow"; readonly addOnId: string; readonly revision: number }
    | { readonly kind: "revoke"; readonly addOnId: string }
    | { readonly kind: "enable" | "disable"; readonly addOnId: string }
    | { readonly kind: "removeMarketplace"; readonly sourceId: string }
    | { readonly kind: "enableTemplates" | "disableTemplates"; readonly sourceId: string }
    | { readonly kind: "addMarketplace" }
    | { readonly kind: "updateMarketplaces" }
    | { readonly kind: "pruneCache" }
    | { readonly kind: "refresh" };

export type AddOnActionResultPayload =
    | { readonly kind: "done"; readonly message?: string }
    | { readonly kind: "refused"; readonly reason: AddOnRefusalPayload; readonly message: string }
    | { readonly kind: "failed"; readonly message: string }
    | { readonly kind: "reportedByFlow" };

export interface AddOnRevealPayload {
    readonly revealId: number;
    readonly addOnIds: readonly string[];
}

/** The add-ons view asks for the latest catalog once its page has loaded. */
export class GetAddOnCatalogCommand extends Command<"GetAddOnCatalogCommand"> {
    constructor() {
        super("GetAddOnCatalogCommand");
    }
}

/** What the user chose in the add-ons view; the host answers with an {@link AddOnActionResultQuery} of the same id. */
export class AddOnRequestCommand extends Command<"AddOnRequestCommand"> {
    public readonly requestId: number;

    public readonly request: AddOnRequestPayload;

    constructor(requestId: number, request: AddOnRequestPayload) {
        super("AddOnRequestCommand");
        this.requestId = requestId;
        this.request = request;
    }
}

export class AddOnCatalogQuery extends Query<"AddOnCatalogQuery"> {
    public readonly model: AddOnCatalogPayload;

    constructor(model: AddOnCatalogPayload) {
        super("AddOnCatalogQuery");
        this.model = model;
    }
}

export class AddOnActionResultQuery extends Query<"AddOnActionResultQuery"> {
    public readonly requestId: number;

    public readonly result: AddOnActionResultPayload;

    constructor(requestId: number, result: AddOnActionResultPayload) {
        super("AddOnActionResultQuery");
        this.requestId = requestId;
        this.result = result;
    }
}

/** Shows these rows: a "Review…" left the code they name to the view. */
export class RevealAddOnsQuery extends Query<"RevealAddOnsQuery"> {
    public readonly reveal: AddOnRevealPayload;

    constructor(reveal: AddOnRevealPayload) {
        super("RevealAddOnsQuery");
        this.reveal = reveal;
    }
}
