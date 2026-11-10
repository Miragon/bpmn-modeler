import type { AddOnCatalogPayload, SourceKindPayload } from "@miragon/bpmn-modeler-shared";

import { reviewOf } from "./placedActions";

/** A group or source header, which opens and closes, or an add-on's row, which sits in one. */
export interface Head {
    readonly id: string;
    readonly parentId?: string;
    /** Only a header opens; a row holds no heads. */
    readonly openByDefault?: boolean;
}

/** The user's own open or closed choices, by head id or {@link reviewKeyOf}. */
export type Expansion = ReadonlyMap<string, boolean>;

/** A marketplace can hold many templates, so it starts closed. */
const SOURCE_OPEN_BY_DEFAULT: Record<SourceKindPayload, boolean> = {
    configFolder: true,
    installedPackages: true,
    marketplace: false,
};

export function headsOf(model: AddOnCatalogPayload): Head[] {
    return model.groups.flatMap((group) => [
        { id: group.id, openByDefault: true },
        ...group.sources.flatMap((source) => [
            {
                id: source.id,
                parentId: group.id,
                openByDefault: SOURCE_OPEN_BY_DEFAULT[source.kind],
            },
            ...source.addOns.map((addOn) => ({ id: addOn.id, parentId: source.id })),
        ]),
    ]);
}

export function isOpen(head: Head, expansion: Expansion): boolean {
    return head.openByDefault !== undefined && (expansion.get(head.id) ?? head.openByDefault);
}

/**
 * The open or closed choices the list follows: the user's kept ones, or, while
 * a filter is on, the page's own choices over its matches.
 */
export interface ListExpansion {
    readonly expansion: Expansion;
    /** What the user opened or closed while the filter is on; it ends with the filter. */
    readonly filterExpansion: Expansion;
    readonly filterActive: boolean;
}

/** A search or filter shows every head with a match open, until the user closes it, and leaves their kept choice as it was. */
export function isShownOpen(head: Head, shown: ListExpansion): boolean {
    if (!shown.filterActive) return isOpen(head, shown.expansion);
    return head.openByDefault !== undefined && (shown.filterExpansion.get(head.id) ?? true);
}

export function ancestorsOf(heads: readonly Head[], id: string): string[] {
    const parentId = heads.find((head) => head.id === id)?.parentId;
    return parentId === undefined ? [] : [...ancestorsOf(heads, parentId), parentId];
}

/** A row's review has a key of its own, as no head id starts with "review:". */
export function reviewKeyOf(addOnId: string): string {
    return `review:${addOnId}`;
}

export function isReviewOpen(addOnId: string, expansion: Expansion): boolean {
    return isReviewKeyOpen(reviewKeyOf(addOnId), expansion);
}

/** Open until the user closes it: Allow sits at its end. */
export function isReviewKeyOpen(key: string, expansion: Expansion): boolean {
    return expansion.get(key) ?? true;
}

export function prunedExpansion(model: AddOnCatalogPayload, expansion: Expansion): Expansion {
    const kept = new Set(headsOf(model).map(({ id }) => id));
    for (const { sources } of model.groups) {
        for (const { addOns } of sources) {
            for (const addOn of addOns) {
                if (reviewOf(addOn) !== undefined) kept.add(reviewKeyOf(addOn.id));
            }
        }
    }
    return new Map([...expansion].filter(([key]) => kept.has(key)));
}
