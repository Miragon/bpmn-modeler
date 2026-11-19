import type {
    MergeHostOffers,
    MergePaneRestoreOffer,
    MergePaneShapelessRow,
    MergePaneStates,
} from "@miragon/bpmn-modeler-shared";
import { type MergeSide, otherSide } from "@miragon/bpmn-modeler-types";

/** The user's pick of one element and whether its XML can be merged by hand, as the panes show it. */
export type MergeElementPick = Pick<MergePaneShapelessRow, "pick" | "handMergeable">;

/** What {@link elementPickOf} reads of the host's states. */
export type MergeElementPickStates = Pick<
    MergePaneStates,
    "pickable" | "badges" | "picksNotDrawn" | "shapelessRows"
>;

/** What the decisions read of what the host offers besides them. */
export type MergePadOffers = Pick<MergeHostOffers, "elementXmlMerge">;

/** Picks the element again with the flows and boundary events `offer` names. */
export interface MergeKeepRemovedWith {
    readonly kind: "keepRemovedWith";
    readonly side: MergeSide;
    readonly offer: MergePaneRestoreOffer;
}

/** `elementId` on a pane: drawn with a badge, picked but drawn by the partner alone, or a menu row. */
export function elementPickOf(states: MergeElementPickStates, elementId: string): MergeElementPick {
    const isIt = ({ id }: { readonly id: string }) => id === elementId;
    const row = rowPickOf(states.shapelessRows.find(isIt));
    const panePick = states.badges.find(isIt) ?? states.picksNotDrawn.find(isIt);
    return elementPick(
        panePick === undefined ? row.pick : pickOf(panePick),
        states.pickable.find(isIt)?.handMergeable ?? row.handMergeable,
    );
}

/** A menu row's own pick, as {@link elementPickOf} finds it; nothing where there is no row. */
export function rowPickOf(row: MergeElementPick | undefined): MergeElementPick {
    return elementPick(row?.pick, row?.handMergeable);
}

/** Merge XML can be offered on the element: its pick allows a merge by hand and the host has a merge editor. */
export function offersMergeXml(
    element: Pick<MergeElementPick, "handMergeable">,
    offers: MergePadOffers,
): boolean {
    return element.handMergeable === true && offers.elementXmlMerge;
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

type MergePickFields = NonNullable<MergeElementPick["pick"]>;

function pickOf({ keptSide, scope, mergedByHand }: MergePickFields): MergePickFields {
    return { keptSide, scope, ...(mergedByHand ? { mergedByHand } : {}) };
}

function elementPick(
    pick: MergeElementPick["pick"],
    handMergeable: MergeElementPick["handMergeable"],
): MergeElementPick {
    return {
        ...(pick === undefined ? {} : { pick }),
        ...(handMergeable === undefined ? {} : { handMergeable }),
    };
}
