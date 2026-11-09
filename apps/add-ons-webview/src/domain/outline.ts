import type { AddOnCatalogPayload, SourceKindPayload } from "@miragon/bpmn-modeler-shared";

type HeadLevel = "group" | "source" | "addOn";

/** One stop of the outline's keyboard path: a group or source header, or an add-on's row. */
export interface OutlineHead {
    readonly id: string;
    readonly level: HeadLevel;
    readonly name: string;
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

export function outlineHeadsOf(model: AddOnCatalogPayload): OutlineHead[] {
    return model.groups.flatMap((group) => [
        { id: group.id, level: "group" as const, name: group.label, openByDefault: true },
        ...group.sources.flatMap((source) => [
            {
                id: source.id,
                level: "source" as const,
                name: source.label,
                parentId: group.id,
                openByDefault: SOURCE_OPEN_BY_DEFAULT[source.kind],
            },
            ...source.addOns.map((addOn) => ({
                id: addOn.id,
                level: "addOn" as const,
                name: addOn.name,
                parentId: source.id,
            })),
        ]),
    ]);
}

export function isOpen(head: OutlineHead, expansion: Expansion): boolean {
    return head.openByDefault !== undefined && (expansion.get(head.id) ?? head.openByDefault);
}

export function visibleHeadsOf(model: AddOnCatalogPayload, expansion: Expansion): OutlineHead[] {
    const heads = outlineHeadsOf(model);
    const shown = new Set<string>();
    return heads.filter((head) => {
        const parent = heads.find(({ id }) => id === head.parentId);
        const visible = parent === undefined || (shown.has(parent.id) && isOpen(parent, expansion));
        if (visible) shown.add(head.id);
        return visible;
    });
}

export function ancestorsOf(heads: readonly OutlineHead[], id: string): string[] {
    const parentId = heads.find((head) => head.id === id)?.parentId;
    return parentId === undefined ? [] : [...ancestorsOf(heads, parentId), parentId];
}

/** A row's review has a key of its own, as no head id starts with "review:". */
export function reviewKeyOf(addOnId: string): string {
    return `review:${addOnId}`;
}

/** Open until the user closes it: Allow sits at its end. */
export function isReviewOpen(addOnId: string, expansion: Expansion): boolean {
    return expansion.get(reviewKeyOf(addOnId)) ?? true;
}

export function prunedExpansion(model: AddOnCatalogPayload, expansion: Expansion): Expansion {
    const kept = new Set(outlineHeadsOf(model).map(({ id }) => id));
    for (const { sources } of model.groups) {
        for (const { addOns } of sources) {
            for (const addOn of addOns) {
                if ("review" in addOn && addOn.review !== undefined)
                    kept.add(reviewKeyOf(addOn.id));
            }
        }
    }
    return new Map([...expansion].filter(([key]) => kept.has(key)));
}
