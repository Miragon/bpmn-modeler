import type { MergePaneRestoreOffer, MergePaneStates } from "@miragon/bpmn-modeler-shared";
import { type MergeSide, otherSide } from "@miragon/bpmn-modeler-types/domain";

/** Picks the element again with the flows and boundary events `offer` names. */
export interface MergeKeepRemovedWith {
    readonly kind: "keepRemovedWith";
    readonly side: MergeSide;
    readonly offer: MergePaneRestoreOffer;
}

/** The host's offer of what was removed with `elementId`, kept from the side that kept the element. */
export function keepRemovedWith(
    states: Pick<MergePaneStates, "restoreOffer">,
    elementId: string,
): MergeKeepRemovedWith | undefined {
    const offer = states.restoreOffer;
    return offer?.elementId === elementId
        ? { kind: "keepRemovedWith", side: otherSide(offer.removedBy), offer }
        : undefined;
}
