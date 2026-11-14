import type {
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";

/** Where an add-on sits: the detail names its folder and source. */
export interface Placement {
    readonly group: AddOnGroupPayload;
    readonly source: AddOnSourcePayload;
    readonly addOn: AddOnPayload;
}

/** Where a source with a detail sits: its detail names it, its scope and its add-ons. */
export interface SourcePlacement {
    readonly group: AddOnGroupPayload;
    readonly source: AddOnSourcePayload;
}

/** Every add-on of these groups, in list order. */
export function addOnsOf(groups: readonly AddOnGroupPayload[]): AddOnPayload[] {
    return groups.flatMap(({ sources }) => sources.flatMap(({ addOns }) => addOns));
}

export function placementOf(
    groups: readonly AddOnGroupPayload[],
    addOnId: string,
): Placement | undefined {
    for (const group of groups) {
        for (const source of group.sources) {
            const addOn = source.addOns.find(({ id }) => id === addOnId);
            if (addOn !== undefined) return { group, source, addOn };
        }
    }
    return undefined;
}

export function sourceOf(
    groups: readonly AddOnGroupPayload[],
    sourceId: string,
): AddOnSourcePayload | undefined {
    return groups.flatMap(({ sources }) => sources).find(({ id }) => id === sourceId);
}

/** Only a source the core gave a detail of its own. */
export function sourcePlacementOf(
    groups: readonly AddOnGroupPayload[],
    sourceId: string,
): SourcePlacement | undefined {
    for (const group of groups) {
        const source = group.sources.find(({ id }) => id === sourceId);
        if (source?.hasDetail === true) return { group, source };
    }
    return undefined;
}

export function isDetailSource(groups: readonly AddOnGroupPayload[], id: string): boolean {
    return sourcePlacementOf(groups, id) !== undefined;
}
