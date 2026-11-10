import type { AddOnCatalogPayload, GroupKindPayload } from "@miragon/bpmn-modeler-shared";

/** One tab of the view: the workspace's folders, or the registered marketplaces. */
export type CatalogScope = "workspace" | "marketplaces";

export const SCOPE_ORDER: readonly CatalogScope[] = ["workspace", "marketplaces"];

const SCOPE_OF_GROUP: Readonly<Record<GroupKindPayload, CatalogScope>> = {
    folder: "workspace",
    marketplaces: "marketplaces",
};

/** Only code waits for a review, and code is listed only in folder groups; templates enable or disable. */
export const REVIEW_SCOPE: CatalogScope = "workspace";

/** The marketplaces tab names its one group already, so its sources stand in the list and the group never closes. */
export function listsFlat(scope: CatalogScope): boolean {
    return scope === "marketplaces";
}

export function isCatalogScope(value: unknown): value is CatalogScope {
    return SCOPE_ORDER.some((scope) => scope === value);
}

/** The catalog of one tab; a group that lists no source yet, as one it could not read, stays in its tab. */
export function scopedCatalog(
    model: AddOnCatalogPayload,
    scope: CatalogScope,
): AddOnCatalogPayload {
    return { ...model, groups: model.groups.filter(({ kind }) => SCOPE_OF_GROUP[kind] === scope) };
}

export function scopeOfAddOn(
    model: AddOnCatalogPayload,
    addOnId: string,
): CatalogScope | undefined {
    const group = model.groups.find(({ sources }) =>
        sources.some(({ addOns }) => addOns.some(({ id }) => id === addOnId)),
    );
    return group === undefined ? undefined : SCOPE_OF_GROUP[group.kind];
}

/** The tab an arrow, Home or End key moves to, as the tab pattern asks; none for any other key. */
export function scopeAfterKey(key: string, current: CatalogScope): CatalogScope | undefined {
    const index = SCOPE_ORDER.indexOf(current);
    const at = (offset: number) =>
        SCOPE_ORDER[(index + offset + SCOPE_ORDER.length) % SCOPE_ORDER.length];
    switch (key) {
        case "ArrowRight":
            return at(1);
        case "ArrowLeft":
            return at(-1);
        case "Home":
            return SCOPE_ORDER[0];
        case "End":
            return SCOPE_ORDER.at(-1);
        default:
            return undefined;
    }
}
