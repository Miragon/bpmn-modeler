import type { CodeState } from "../../kernel/domain/codeApproval";
import type { AddOnActionKind, AddOnKind, CatalogActionKind, SourceKind } from "./addOnIds";

export interface ActionView<K extends string> {
    readonly kind: K;
    readonly label: string;
}

/** What a view shows: built by the core, rendered by a host, never read back. */
export interface AddOnCatalogModel {
    /** Strictly increasing, across a respawned process too; an allow names the revision it was shown in. */
    readonly revision: number;
    /** Workspace folders in the order they were opened. */
    readonly groups: readonly AddOnGroupView[];
    readonly actions: readonly ActionView<CatalogActionKind>[];
    readonly emptyText?: string;
}

export interface AddOnGroupView {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly sources: readonly AddOnSourceView[];
}

export interface AddOnSourceView {
    readonly id: string;
    readonly kind: SourceKind;
    readonly label: string;
    readonly description: string;
    readonly addOns: readonly AddOnView[];
}

export interface AddOnReview {
    readonly heading: string;
    readonly warning: string;
    readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface AddOnView {
    readonly id: string;
    readonly kind: AddOnKind;
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
