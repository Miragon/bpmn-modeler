import type {
    MergeHostOffers,
    MergePaneHandMergeStart,
    MergePanePick,
    MergePanePickable,
    MergePaneStates,
} from "@miragon/bpmn-modeler-shared";

/** The user's pick of one element and how its XML can be merged by hand, as the panes show it. */
export type MergeElementPick = Pick<MergePanePickable, "pick" | "handMerge">;

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
        ...(element?.handMerge === undefined ? {} : { handMerge: element.handMerge }),
    };
}

/**
 * How Merge XML starts on the element: on the version the user's pick keeps,
 * or with a pick of its own where none decides the element yet. Not offered
 * where its three texts do not differ or the host has no merge editor.
 */
export function mergeXmlStartOf(
    element: Pick<MergeElementPick, "handMerge">,
    offers: MergePadOffers,
): MergePaneHandMergeStart | undefined {
    return offers.elementXmlMerge ? element.handMerge : undefined;
}

/** Merge XML opens on the version the user's pick keeps, which Edit again needs still to stand. */
export function mergesPickedXml(
    element: Pick<MergeElementPick, "handMerge">,
    offers: MergePadOffers,
): boolean {
    return mergeXmlStartOf(element, offers) === "pickedVersion";
}
