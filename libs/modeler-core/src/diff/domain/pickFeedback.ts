import { type MergeSide, otherSide } from "@miragon/bpmn-modeler-types";

/** The flows and boundary events a pick of an element left out, which keeping them with it would bring back. */
export interface PickRestoreOffer {
    readonly elementId: string;
    readonly connections: readonly string[];
    /** Set only when not empty. */
    readonly boundaryEvents?: readonly string[];
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

/**
 * The offer goes to the pane whose side kept the element, naming the side
 * that removed it. An element no canvas draws has no kept side's canvas to
 * offer it at, so both panes get it, wherever its row is listed.
 */
export function restoreOfferOnPane(
    offer: PickRestoreOffer | undefined,
    paneSide: MergeSide,
    shapeless: readonly { readonly id: string }[],
): PaneRestoreOffer | undefined {
    if (offer === undefined) return undefined;
    const boundaryEvents = offer.boundaryEvents ?? [];
    if (offer.connections.length === 0 && boundaryEvents.length === 0) return undefined;
    const onBothPanes = shapeless.some(({ id }) => id === offer.elementId);
    if (!onBothPanes && offer.keptSide !== paneSide) return undefined;
    return {
        elementId: offer.elementId,
        connections: offer.connections,
        ...(boundaryEvents.length === 0 ? {} : { boundaryEvents }),
        removedBy: otherSide(offer.keptSide),
    };
}

interface PaneRestoreOffer {
    readonly elementId: string;
    readonly connections: readonly string[];
    readonly boundaryEvents?: readonly string[];
    readonly removedBy: MergeSide;
}
