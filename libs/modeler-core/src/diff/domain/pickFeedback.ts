import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { otherMergeSide } from "./mergePaneSide";

/** The flows a pick of an element left out, which keeping them with it would bring back. */
export interface PickRestoreOffer {
    readonly elementId: string;
    readonly connections: readonly string[];
    readonly keptSide: MergeSide;
}

/**
 * The elements a pick or an undo opened again: decided before, open after.
 * The merge names only what it newly decided, so the core compares.
 */
export function reopenedConflicts(
    openBefore: readonly string[],
    openAfter: readonly string[],
): string[] {
    const before = new Set(openBefore);
    return openAfter.filter((id) => !before.has(id));
}

/** The offer goes to the pane whose side kept the element, naming the side that removed it. */
export function restoreOfferOnPane(
    offer: PickRestoreOffer | undefined,
    paneSide: MergeSide,
): { elementId: string; connections: readonly string[]; removedBy: MergeSide } | undefined {
    if (offer === undefined || offer.connections.length === 0 || offer.keptSide !== paneSide) {
        return undefined;
    }
    return {
        elementId: offer.elementId,
        connections: offer.connections,
        removedBy: otherMergeSide(offer.keptSide),
    };
}
