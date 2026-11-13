import type {
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnSourcePayload,
    SourceKindPayload,
} from "@miragon/bpmn-modeler-shared";

/** A group or source header, which opens and closes, or an add-on's row, which sits in one. */
export interface Head {
    readonly id: string;
    readonly parentId?: string;
    /** Only a header opens; a row holds no heads. */
    readonly openByDefault?: boolean;
}

/** The user's own open or closed choices, by head id. */
export type Expansion = ReadonlyMap<string, boolean>;

/** A marketplace can hold many templates, so it starts closed. */
const SOURCE_OPEN_BY_DEFAULT: Record<SourceKindPayload, boolean> = {
    configFolder: true,
    installedPackages: true,
    marketplace: false,
};

export function headsOf(model: AddOnCatalogPayload): Head[] {
    return model.groups.flatMap((group) => [
        groupHead(group),
        ...group.sources.flatMap((source) => [
            sourceHead(source, group.id),
            ...source.addOns.map((addOn) => ({ id: addOn.id, parentId: source.id })),
        ]),
    ]);
}

function groupHead(group: AddOnGroupPayload): Head {
    return { id: group.id, openByDefault: true };
}

function sourceHead(source: AddOnSourcePayload, groupId: string): Head {
    return { id: source.id, parentId: groupId, openByDefault: SOURCE_OPEN_BY_DEFAULT[source.kind] };
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

/** The rows the list shows: under open headers, or, while a filter is on, until the user closes theirs; a group without its header never closes. */
export function rowsInSight(
    groups: readonly AddOnGroupPayload[],
    shown: ListExpansion,
    flatGroupIds: ReadonlySet<string>,
): ReadonlySet<string> {
    const openGroups = groups.filter(
        (group) => flatGroupIds.has(group.id) || isShownOpen(groupHead(group), shown),
    );
    return new Set(
        openGroups.flatMap((group) =>
            group.sources
                .filter((source) => isShownOpen(sourceHead(source, group.id), shown))
                .flatMap(({ addOns }) => addOns.map(({ id }) => id)),
        ),
    );
}

export function ancestorsOf(heads: readonly Head[], id: string): string[] {
    const parentId = heads.find((head) => head.id === id)?.parentId;
    return parentId === undefined ? [] : [...ancestorsOf(heads, parentId), parentId];
}

/** An older page's keys for a row's review drop out too: no head has that id. */
export function prunedExpansion(model: AddOnCatalogPayload, expansion: Expansion): Expansion {
    const kept = new Set(headsOf(model).map(({ id }) => id));
    return new Map([...expansion].filter(([key]) => kept.has(key)));
}
