import type { AddOnCatalogModel } from "./addOnCatalogModel";
import { addOnDetailTitle } from "./addOnTexts";

/** The add-on a detail tab shows, with the tab's title. */
export interface AddOnDetailTarget {
    readonly addOnId: string;
    readonly title: string;
}

/**
 * Only an add-on or a marketplace the catalog lists opens, so a tab never
 * names one the view cannot show. A marketplace has a detail of its own.
 */
export function detailTargetOf(
    model: AddOnCatalogModel | undefined,
    addOnId: string,
): AddOnDetailTarget | undefined {
    const sources = model?.groups.flatMap((group) => group.sources) ?? [];
    const name =
        sources.flatMap(({ addOns }) => addOns).find(({ id }) => id === addOnId)?.name ??
        sources.find(({ id, kind }) => id === addOnId && kind === "marketplace")?.label;
    return name === undefined ? undefined : { addOnId, title: addOnDetailTitle(name) };
}
