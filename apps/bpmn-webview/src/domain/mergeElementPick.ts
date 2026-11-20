import type {
    MergeHostOffers,
    MergePanePick,
    MergePanePickable,
    MergePaneStates,
} from "@miragon/bpmn-modeler-shared";

/** The user's pick of one element and whether its XML can be merged by hand, as the panes show it. */
export type MergeElementPick = Pick<MergePanePickable, "pick" | "handMergeable">;

/** What {@link elementPickOf} and {@link panePicks} read of the host's states. */
export type MergeElementPickStates = Pick<MergePaneStates, "pickable">;

/** One element the user's picks decide on a pane, with its pick. */
export interface MergePickedElement {
    readonly id: string;
    readonly pick: MergePanePick;
}

/** What the decisions read of what the host offers besides them. */
export type MergePadOffers = Pick<MergeHostOffers, "elementXmlMerge">;

/** `elementId` on a pane, drawn or listed in the menu. */
export function elementPickOf(states: MergeElementPickStates, elementId: string): MergeElementPick {
    return ownPickOf(states.pickable.find(({ id }) => id === elementId));
}

/** Every element the user's picks decide on a pane, once each, in result order. */
export function panePicks(states: MergeElementPickStates): readonly MergePickedElement[] {
    return states.pickable.flatMap(({ id, pick }) => (pick === undefined ? [] : [{ id, pick }]));
}

/** The pick of a pickable entry, which a menu row is too; nothing where there is no entry. */
export function ownPickOf(element: MergeElementPick | undefined): MergeElementPick {
    return {
        ...(element?.pick === undefined ? {} : { pick: element.pick }),
        ...(element?.handMergeable === undefined ? {} : { handMergeable: element.handMergeable }),
    };
}

/** Merge XML can be offered on the element: its pick allows a merge by hand and the host has a merge editor. */
export function offersMergeXml(
    element: Pick<MergeElementPick, "handMergeable">,
    offers: MergePadOffers,
): boolean {
    return element.handMergeable === true && offers.elementXmlMerge;
}
