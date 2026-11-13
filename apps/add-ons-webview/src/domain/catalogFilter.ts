import type {
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";

import { addOnsOf } from "./catalogQueries";

export type AddOnKind = AddOnPayload["kind"];

export const KIND_ORDER: readonly AddOnKind[] = ["plugin", "rulePackage", "elementTemplate"];

/** The user's search and kind; they apply to every section of the list. */
export interface CatalogFilter {
    readonly query: string;
    /** Absent: every kind. */
    readonly kind?: AddOnKind;
}

export const NO_FILTER: CatalogFilter = { query: "" };

/** Read from what the core offers, so the view never repeats the core's approval rule. */
export function needsReview(addOn: AddOnPayload): boolean {
    return addOn.actions.some(({ kind }) => kind === "allow");
}

export function isFilterActive(filter: CatalogFilter): boolean {
    return termsOf(filter.query).length > 0 || filter.kind !== undefined;
}

/** Without a filter the catalog as it came, so a source with only a problem still shows. */
export function filteredGroups(
    model: AddOnCatalogPayload,
    filter: CatalogFilter,
): readonly AddOnGroupPayload[] {
    if (!isFilterActive(filter)) return model.groups;
    const terms = termsOf(filter.query);
    return model.groups
        .map((group) => ({
            ...group,
            sources: group.sources
                .map((source) => ({
                    ...source,
                    addOns: source.addOns.filter((addOn) =>
                        matches(addOn, source, group, filter, terms),
                    ),
                }))
                .filter(({ addOns }) => addOns.length > 0),
        }))
        .filter(({ sources }) => sources.length > 0);
}

/** `total` and `byKind` count every add-on; what waits and what has a problem only those of the chosen kind. */
export interface CatalogCounts {
    readonly total: number;
    readonly byKind: Readonly<Record<AddOnKind, number>>;
    readonly needsReview: number;
    readonly problems: number;
}

export function catalogCounts(model: AddOnCatalogPayload, kind?: AddOnKind): CatalogCounts {
    const addOns = addOnsOf(model.groups);
    const byKind: Record<AddOnKind, number> = { plugin: 0, rulePackage: 0, elementTemplate: 0 };
    addOns.forEach((addOn) => byKind[addOn.kind]++);
    const ofKind = addOns.filter((addOn) => kind === undefined || addOn.kind === kind);
    return {
        total: addOns.length,
        byKind,
        needsReview: ofKind.filter(needsReview).length,
        problems: ofKind.filter(({ problem }) => problem !== undefined).length,
    };
}

function termsOf(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matches(
    addOn: AddOnPayload,
    source: AddOnSourcePayload,
    group: AddOnGroupPayload,
    filter: CatalogFilter,
    terms: readonly string[],
): boolean {
    if (filter.kind !== undefined && addOn.kind !== filter.kind) return false;
    const haystack = [
        addOn.name,
        addOn.detail,
        addOn.kindText,
        addOn.stateText,
        "engineText" in addOn ? addOn.engineText : undefined,
        source.label,
        group.label,
    ]
        .filter((text): text is string => text !== undefined)
        .join("\n")
        .toLowerCase();
    return terms.every((term) => haystack.includes(term));
}
