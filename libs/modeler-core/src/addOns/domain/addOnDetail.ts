import type { AddOnCatalogModel } from "./addOnCatalogModel";
import { addOnDetailTitle } from "./addOnTexts";

/** The add-on a detail tab shows, with the tab's title. */
export interface AddOnDetailTarget {
    readonly addOnId: string;
    readonly title: string;
}

/** Only an add-on the catalog lists opens, so a tab never names one the view cannot show. */
export function detailTargetOf(
    model: AddOnCatalogModel | undefined,
    addOnId: string,
): AddOnDetailTarget | undefined {
    const addOn = model?.groups
        .flatMap(({ sources }) => sources.flatMap(({ addOns }) => addOns))
        .find(({ id }) => id === addOnId);
    return addOn === undefined ? undefined : { addOnId, title: addOnDetailTitle(addOn.name) };
}
