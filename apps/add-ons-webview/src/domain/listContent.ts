import type {
    ActionViewPayload,
    AddOnCatalogPayload,
    CatalogActionKindPayload,
} from "@miragon/bpmn-modeler-shared";

import { CatalogFilter, filteredGroups, isFilterActive } from "./catalogFilter";
import { ListSections, sectionsOf } from "./listSections";

/** `ready`: the toolbar, the list and the detail show; otherwise only what the catalog says. */
export type CatalogPhase = "loading" | "ready" | "empty" | "failed";

type CatalogButtons = readonly ActionViewPayload<CatalogActionKindPayload>[];

/** What the list shows. */
export type ListContent =
    | { readonly kind: "catalogEmpty"; readonly text?: string; readonly buttons: CatalogButtons }
    | { readonly kind: "noMatch" }
    | {
          readonly kind: "sections";
          readonly sections: ListSections;
          /** No folder lists anything: the core's text says why, where Installed would be. */
          readonly installedText?: string;
      };

/** An empty catalog offers only the step that brings something in; housekeeping waits in the menu. */
const EMPTY_BUTTONS: readonly CatalogActionKindPayload[] = ["addMarketplace"];

export function catalogPhaseOf(model: AddOnCatalogPayload | undefined): CatalogPhase {
    if (model === undefined) return "loading";
    if (model.groups.length > 0) return "ready";
    return model.problem === undefined ? "empty" : "failed";
}

export function listContentOf(model: AddOnCatalogPayload, filter: CatalogFilter): ListContent {
    if (model.groups.length === 0) {
        const buttons = model.actions.filter(({ kind }) => EMPTY_BUTTONS.includes(kind));
        return { kind: "catalogEmpty", text: model.emptyText, buttons };
    }
    const groups = filteredGroups(model, filter);
    if (isFilterActive(filter) && groups.length === 0) return { kind: "noMatch" };
    const sections = sectionsOf(groups);
    const installedEmpty = !isFilterActive(filter) && sections.installed.length === 0;
    return {
        kind: "sections",
        sections,
        ...(installedEmpty && model.emptyText !== undefined && { installedText: model.emptyText }),
    };
}
