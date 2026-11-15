import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

/** How a member of a collection is known in every version: by its id, or as the object itself without one. */
export type ItemKey = string | ModdleElement;

export function itemKeyOf(element: ModdleElement): ItemKey {
    return element.id ?? element;
}

/**
 * The members of one collection of the merged document: current's order,
 * then each member only incoming's order places, after its nearest
 * predecessor there that is already placed, or first.
 */
export function orderMembers<Key>(
    currentOrder: readonly Key[],
    incomingOrder: readonly Key[],
    members: ReadonlySet<Key>,
): Key[] {
    const ordered = currentOrder.filter((key) => members.has(key));
    const placed = new Set(ordered);
    incomingOrder.forEach((key, index) => {
        if (!members.has(key) || placed.has(key)) return;
        const predecessor = incomingOrder
            .slice(0, index)
            .findLast((candidate) => placed.has(candidate));
        ordered.splice(predecessor === undefined ? 0 : ordered.indexOf(predecessor) + 1, 0, key);
        placed.add(key);
    });
    return [...ordered, ...[...members].filter((key) => !placed.has(key))];
}
