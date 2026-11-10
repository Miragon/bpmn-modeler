import type {
    ActionViewPayload,
    AddOnCatalogPayload,
    AddOnGroupPayload,
    CatalogActionKindPayload,
} from "@miragon/bpmn-modeler-shared";

import { CatalogFilter, filteredGroups } from "./catalogFilter";
import { CatalogScope, scopedCatalog } from "./catalogScope";

/** `ready`: the tabs, the list and the detail show; otherwise only what the catalog says. */
export type CatalogPhase = "loading" | "ready" | "empty" | "failed";

type CatalogButtons = readonly ActionViewPayload<CatalogActionKindPayload>[];

/** What the tab's list shows, with the catalog actions it offers as visible buttons. */
export type ListContent =
    | { readonly kind: "catalogEmpty"; readonly text?: string; readonly buttons: CatalogButtons }
    | { readonly kind: "noMarketplace"; readonly buttons: CatalogButtons }
    | { readonly kind: "workspaceEmpty"; readonly text?: string }
    | { readonly kind: "noMatch"; readonly buttons: CatalogButtons }
    | {
          readonly kind: "groups";
          readonly groups: readonly AddOnGroupPayload[];
          /** The marketplaces tab names its one group already: its sources stand in the list. */
          readonly flat: boolean;
          readonly buttons: CatalogButtons;
      };

const MARKETPLACE_BUTTONS: readonly CatalogActionKindPayload[] = [
    "addMarketplace",
    "updateMarketplaces",
];

export function catalogPhaseOf(model: AddOnCatalogPayload | undefined): CatalogPhase {
    if (model === undefined) return "loading";
    if (model.groups.length > 0) return "ready";
    return model.problem === undefined ? "empty" : "failed";
}

export function listContentOf(
    model: AddOnCatalogPayload,
    scope: CatalogScope,
    filter: CatalogFilter,
): ListContent {
    if (model.groups.length === 0) {
        return { kind: "catalogEmpty", text: model.emptyText, buttons: model.actions };
    }
    const scoped = scopedCatalog(model, scope);
    if (scope === "workspace" && scoped.groups.length === 0) {
        // The core's text says why: no folder is open, or none holds an add-on.
        return { kind: "workspaceEmpty", text: model.emptyText };
    }
    const holdsMarketplace = scoped.groups.some(
        ({ sources, problem }) => sources.length > 0 || problem !== undefined,
    );
    if (scope === "marketplaces" && !holdsMarketplace) {
        return { kind: "noMarketplace", buttons: buttonsOf(model, ["addMarketplace"]) };
    }
    const buttons = scope === "marketplaces" ? buttonsOf(model, MARKETPLACE_BUTTONS) : [];
    const groups = filteredGroups(scoped, filter);
    if (groups.length === 0) return { kind: "noMatch", buttons };
    return { kind: "groups", groups, flat: scope === "marketplaces", buttons };
}

function buttonsOf(
    model: AddOnCatalogPayload,
    kinds: readonly CatalogActionKindPayload[],
): CatalogButtons {
    return model.actions.filter(({ kind }) => kinds.includes(kind));
}
