import type {
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";

import { addOnsOf } from "./catalogQueries";

export type AddOnKind = AddOnPayload["kind"];

export const KIND_ORDER: readonly AddOnKind[] = ["plugin", "rulePackage", "elementTemplate"];

/** The user's search and filter chips; they apply inside the chosen tab. */
export interface CatalogFilter {
    readonly query: string;
    /** Empty: every kind. */
    readonly kinds: ReadonlySet<AddOnKind>;
    readonly onlyNeedsReview: boolean;
}

export const NO_FILTER: CatalogFilter = { query: "", kinds: new Set(), onlyNeedsReview: false };
export const NEEDS_REVIEW_ONLY: CatalogFilter = { ...NO_FILTER, onlyNeedsReview: true };

/** Only the review chip is on: no search, no kind. */
export function isOnlyNeedsReview(filter: CatalogFilter): boolean {
    return filter.onlyNeedsReview && filter.kinds.size === 0 && termsOf(filter.query).length === 0;
}

/** Read from what the core offers, so the view never repeats the core's approval rule. */
export function needsReview(addOn: AddOnPayload): boolean {
    return addOn.actions.some(({ kind }) => kind === "allow");
}

export function isFilterActive(filter: CatalogFilter): boolean {
    return termsOf(filter.query).length > 0 || filter.kinds.size > 0 || filter.onlyNeedsReview;
}

export function withKindToggled(filter: CatalogFilter, kind: AddOnKind): CatalogFilter {
    const kinds = new Set(filter.kinds);
    if (!kinds.delete(kind)) kinds.add(kind);
    return { ...filter, kinds };
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

export interface CatalogCounts {
    readonly total: number;
    readonly byKind: Readonly<Record<AddOnKind, number>>;
    readonly needsReview: number;
}

export function catalogCounts(model: AddOnCatalogPayload): CatalogCounts {
    const addOns = addOnsOf(model.groups);
    const byKind: Record<AddOnKind, number> = { plugin: 0, rulePackage: 0, elementTemplate: 0 };
    addOns.forEach(({ kind }) => byKind[kind]++);
    return { total: addOns.length, byKind, needsReview: addOns.filter(needsReview).length };
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
    if (filter.kinds.size > 0 && !filter.kinds.has(addOn.kind)) return false;
    if (filter.onlyNeedsReview && !needsReview(addOn)) return false;
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
