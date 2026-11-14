import type { ElementState, LayoutState } from "./mergeResult";

/** What one version holds of an element; absent when the version does not hold it. */
export interface ClassifiedVersion {
    /** Content, parent and lanes, comparable by equality. */
    readonly key: string;
    /** Absent when the version does not draw the element. */
    readonly layout?: string;
}

export interface ClassifiedVersions {
    readonly base?: ClassifiedVersion;
    readonly current?: ClassifiedVersion;
    readonly incoming?: ClassifiedVersion;
}

export function elementStateOf(
    { base, current, incoming }: ClassifiedVersions,
    hasBase: boolean,
): ElementState {
    if (!hasBase) return stateWithoutBase(current, incoming);
    if (!base) return additionState(current, incoming);
    if (!current || !incoming) return removalState(base, current, incoming);
    const currentChanged = current.key !== base.key;
    const incomingChanged = incoming.key !== base.key;
    if (currentChanged && incomingChanged)
        return current.key === incoming.key ? "sameChange" : "bothChanged";
    return changeState(currentChanged, incomingChanged);
}

/** Without a base, or for an element the base lacks, differing layouts go to current: layout is never a conflict. */
export function layoutStateOf({ base, current, incoming }: ClassifiedVersions): LayoutState {
    if (base) {
        return changeState(
            current !== undefined && current.layout !== base.layout,
            incoming !== undefined && incoming.layout !== base.layout,
        );
    }
    if (current && incoming)
        return current.layout === incoming.layout ? "unchanged" : "bothChanged";
    return changeState(current?.layout !== undefined, incoming?.layout !== undefined);
}

function stateWithoutBase(
    current: ClassifiedVersion | undefined,
    incoming: ClassifiedVersion | undefined,
): ElementState {
    if (current && incoming) return current.key === incoming.key ? "unchanged" : "differs";
    return current ? "onlyInCurrent" : "onlyInIncoming";
}

function removalState(
    base: ClassifiedVersion,
    current: ClassifiedVersion | undefined,
    incoming: ClassifiedVersion | undefined,
): ElementState {
    const remaining = current ?? incoming;
    if (!remaining) return "removedByBoth";
    const keptAsInBase = remaining.key === base.key;
    if (current) return keptAsInBase ? "removedByIncoming" : "changedAndRemoved";
    return keptAsInBase ? "removedByCurrent" : "removedAndChanged";
}

function additionState(
    current: ClassifiedVersion | undefined,
    incoming: ClassifiedVersion | undefined,
): ElementState {
    if (current && incoming) return current.key === incoming.key ? "sameAddition" : "bothAdded";
    return current ? "addedByCurrent" : "addedByIncoming";
}

function changeState(currentChanged: boolean, incomingChanged: boolean): LayoutState {
    if (currentChanged && incomingChanged) return "bothChanged";
    if (currentChanged) return "takenFromCurrent";
    return incomingChanged ? "takenFromIncoming" : "unchanged";
}
