import type { BrandMode } from "./brandMode";
import { Command, Query } from "./messages";

/*
 * Copies of the core's add-on catalog model, request and result, field for
 * field: the core's types sit behind the package boundary. The spec of the
 * core's protocol adapter pins each copy to its home.
 */

export type CodeStatePayload = "approved" | "new" | "declined";

export type TemplateStatePayload = "enabled" | "disabled";

export type SourceKindPayload = "configFolder" | "installedPackages" | "marketplace";

export type GroupKindPayload = "folder" | "marketplaces";

export type CodeAddOnKindPayload = "plugin" | "rulePackage";

export type AddOnActionKindPayload = "allow" | "revoke" | "enable" | "disable";

export type SourceActionKindPayload = "removeMarketplace" | "enableTemplates" | "disableTemplates";

export type CatalogActionKindPayload = "addMarketplace" | "updateMarketplaces" | "pruneCache";

export type AddOnRefusalPayload =
    | "unknownAddOn"
    | "unknownSource"
    | "staleView"
    | "closedView"
    | "notOffered"
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
    readonly kind: GroupKindPayload;
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

/** An add-on's or a marketplace's README as Markdown its author wrote, which the page renders without HTML. */
export type AddOnReadmePayload =
    | { readonly kind: "shown"; readonly markdown: string; readonly truncated: boolean }
    | { readonly kind: "none" }
    | { readonly kind: "unreadable"; readonly text: string };

export interface AddOnLicensePayload {
    readonly kind: "known" | "other" | "none";
    readonly text: string;
    readonly label: string;
}

export interface AddOnStarsPayload {
    readonly text: string;
    readonly label: string;
}

/** What a detail shows below the core's facts. */
export interface AddOnAboutPayload {
    readonly readme: AddOnReadmePayload;
    readonly license?: AddOnLicensePayload;
    readonly stars?: AddOnStarsPayload;
}

/** Where a view is to go, once: rows a "Review…" left to it, or every add-on that needs review. */
export type AddOnRevealPayload =
    | { readonly kind: "rows"; readonly revealId: number; readonly addOnIds: readonly string[] }
    | { readonly kind: "needsReview"; readonly revealId: number };

/** The add-ons view asks for the latest catalog once its page has loaded. */
export class GetAddOnCatalogCommand extends Command<"GetAddOnCatalogCommand"> {
    constructor() {
        super("GetAddOnCatalogCommand");
    }
}

/** The list asks the host to show this add-on's details in an editor tab. */
export class OpenAddOnDetailCommand extends Command<"OpenAddOnDetailCommand"> {
    public readonly addOnId: string;

    constructor(addOnId: string) {
        super("OpenAddOnDetailCommand");
        this.addOnId = addOnId;
    }
}

/** Which add-on a detail page shows; it comes before the catalog, so the page never shows another first. */
export class ShowAddOnQuery extends Query<"ShowAddOnQuery"> {
    public readonly addOnId: string;

    constructor(addOnId: string) {
        super("ShowAddOnQuery");
        this.addOnId = addOnId;
    }
}

/** A detail asks for the README and license of the add-on or marketplace it shows; the host answers with an {@link AddOnAboutQuery}. */
export class GetAddOnAboutCommand extends Command<"GetAddOnAboutCommand"> {
    public readonly targetId: string;

    constructor(targetId: string) {
        super("GetAddOnAboutCommand");
        this.targetId = targetId;
    }
}

export class AddOnAboutQuery extends Query<"AddOnAboutQuery"> {
    public readonly targetId: string;

    public readonly about: AddOnAboutPayload;

    constructor(targetId: string, about: AddOnAboutPayload) {
        super("AddOnAboutQuery");
        this.targetId = targetId;
        this.about = about;
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

/** Shows these rows, as a "Review…" left their code to the view, or every add-on that needs review, as Review Add-ons asks. */
export class RevealAddOnsQuery extends Query<"RevealAddOnsQuery"> {
    public readonly reveal: AddOnRevealPayload;

    constructor(reveal: AddOnRevealPayload) {
        super("RevealAddOnsQuery");
        this.reveal = reveal;
    }
}

/** A theme change in the IDE or of the `colorTheme` setting; the shell carried the mode until then. */
export class BrandModeQuery extends Query<"BrandModeQuery"> {
    public readonly mode: BrandMode;

    constructor(mode: BrandMode) {
        super("BrandModeQuery");
        this.mode = mode;
    }
}
