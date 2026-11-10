import type { CodeState } from "../../kernel/domain/codeApproval";
import type {
    AddOnActionKind,
    CatalogActionKind,
    CodeAddOnKind,
    GroupKind,
    SourceActionKind,
    SourceKind,
    TemplateState,
} from "./addOnIds";

export interface ActionView<K extends string> {
    readonly kind: K;
    readonly label: string;
}

/** What a view shows: built by the core, rendered by a host, never read back. */
export interface AddOnCatalogModel {
    /** Strictly increasing, across a respawned process too; an allow names the revision it was shown in. */
    readonly revision: number;
    /** Workspace folders in the order they were opened, then the marketplaces. */
    readonly groups: readonly AddOnGroupView[];
    readonly actions: readonly ActionView<CatalogActionKind>[];
    /** Why no workspace folder lists an add-on: none is open, or none brings one. */
    readonly emptyText?: string;
    /** Why the catalog could not be read; the groups are then what it read before, if anything. */
    readonly problem?: string;
}

export interface AddOnGroupView {
    readonly id: string;
    /** Ids are never parsed, and the marketplaces group may list no source to tell it by. */
    readonly kind: GroupKind;
    readonly label: string;
    readonly description: string;
    /** Why it lists none of its sources. */
    readonly problem?: string;
    readonly sources: readonly AddOnSourceView[];
}

export interface AddOnSourceView {
    readonly id: string;
    readonly kind: SourceKind;
    readonly label: string;
    readonly description: string;
    readonly problem?: string;
    /** Only for a source whose templates the user switched off. */
    readonly stateText?: string;
    readonly actions: readonly ActionView<SourceActionKind>[];
    readonly addOns: readonly AddOnView[];
}

export interface AddOnReview {
    readonly heading: string;
    readonly warning: string;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface CodeAddOnView {
    readonly id: string;
    readonly kind: CodeAddOnKind;
    readonly kindText: string;
    readonly name: string;
    readonly detail?: string;
    readonly state: CodeState;
    readonly stateText: string;
    readonly problem?: string;
    readonly note?: string;
    /** Only for content the user can allow now. */
    readonly review?: AddOnReview;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

export interface TemplateAddOnView {
    readonly id: string;
    readonly kind: "elementTemplate";
    readonly kindText: string;
    readonly name: string;
    readonly detail?: string;
    readonly engineText?: string;
    readonly state: TemplateState;
    readonly stateText: string;
    /** Why its file cannot be read. */
    readonly problem?: string;
    /** Why it offers no switch of its own now. */
    readonly note?: string;
    readonly actions: readonly ActionView<AddOnActionKind>[];
}

export type AddOnView = CodeAddOnView | TemplateAddOnView;

/** Rows a view is to show and focus, once: a "Review…" left the code they name to it. */
export interface AddOnReveal {
    readonly revealId: number;
    readonly addOnIds: readonly string[];
}
