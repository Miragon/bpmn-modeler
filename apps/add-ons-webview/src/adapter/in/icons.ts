import type {
    AddOnActionKindPayload,
    AddOnPayload,
    CatalogActionKindPayload,
    SourceActionKindPayload,
    SourceKindPayload,
} from "@miragon/bpmn-modeler-shared";
import {
    Eraser,
    FileSearch,
    Folder,
    IconNode,
    LayoutTemplate,
    ListChecks,
    Package,
    Plus,
    Power,
    PowerOff,
    Puzzle,
    RefreshCw,
    ShieldCheck,
    ShieldOff,
    Store,
    Trash,
} from "lucide";

import { revokeForgets } from "../../domain/actionEmphasis";
import type { AddOnKind } from "../../domain/catalogFilter";

/** The one home of the view's icon choices for the model's kinds and actions. */

export const KIND_ICON: Readonly<Record<AddOnKind, IconNode>> = {
    plugin: Puzzle,
    rulePackage: ListChecks,
    elementTemplate: LayoutTemplate,
};

export const SOURCE_ICON: Readonly<Record<SourceKindPayload, IconNode>> = {
    configFolder: Folder,
    installedPackages: Package,
    marketplace: Store,
};

export const SOURCE_ACTION_ICON: Readonly<Record<SourceActionKindPayload, IconNode>> = {
    removeMarketplace: Trash,
    enableTemplates: Power,
    disableTemplates: PowerOff,
};

export const CATALOG_ACTION_ICON: Readonly<Record<CatalogActionKindPayload, IconNode>> = {
    addMarketplace: Plus,
    updateMarketplaces: RefreshCw,
    pruneCache: Eraser,
};

const ADD_ON_ACTION_ICON: Readonly<Record<AddOnActionKindPayload, IconNode>> = {
    inspect: FileSearch,
    allow: ShieldCheck,
    revoke: ShieldOff,
    enable: Power,
    disable: PowerOff,
};

export function addOnActionIcon(kind: AddOnActionKindPayload, addOn: AddOnPayload): IconNode {
    return kind === "revoke" && revokeForgets(addOn) ? Trash : ADD_ON_ACTION_ICON[kind];
}
