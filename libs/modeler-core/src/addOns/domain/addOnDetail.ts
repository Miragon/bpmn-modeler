import type { AddOnCatalogModel } from "./addOnCatalogModel";
import { addOnDetailTitle, sourceDetailTitle } from "./addOnTexts";

/** The add-on a detail tab shows, with the tab's title. */
export interface AddOnDetailTarget {
    readonly addOnId: string;
    readonly title: string;
}

/** Only an add-on or a source with a detail the catalog lists opens, so a tab never names one the view cannot show. */
export function detailTargetOf(
    model: AddOnCatalogModel | undefined,
    addOnId: string,
): AddOnDetailTarget | undefined {
    const sources = model?.groups.flatMap((group) => group.sources) ?? [];
    const addOn = sources.flatMap(({ addOns }) => addOns).find(({ id }) => id === addOnId);
    if (addOn !== undefined) return { addOnId, title: addOnDetailTitle(addOn.name) };
    const source = sources.find(({ id, hasDetail }) => id === addOnId && hasDetail === true);
    return source === undefined
        ? undefined
        : { addOnId, title: sourceDetailTitle(source.kind, source.label) };
}
