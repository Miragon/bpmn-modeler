import type {
    MergeHostOffers,
    MergePaneShapelessRow,
    MergePaneStates,
} from "@miragon/bpmn-modeler-shared";

/** The user's pick of one element and whether its XML can be merged by hand, as the panes show it. */
export type MergeElementPick = Pick<MergePaneShapelessRow, "pick" | "handMergeable">;

/** What {@link panePicks} reads of the host's states. */
export type MergePanePickStates = Pick<
    MergePaneStates,
    "badges" | "picksNotDrawn" | "shapelessRows"
>;

/** What {@link elementPickOf} reads of the host's states. */
export type MergeElementPickStates = MergePanePickStates & Pick<MergePaneStates, "pickable">;

/** One element the user's picks decide on a pane, with its pick. */
export interface MergePickedElement {
    readonly id: string;
    readonly pick: MergePickFields;
}

/** What the decisions read of what the host offers besides them. */
export type MergePadOffers = Pick<MergeHostOffers, "elementXmlMerge">;

/** `elementId` on a pane: drawn with a badge, picked but drawn by the partner alone, or a menu row. */
export function elementPickOf(states: MergeElementPickStates, elementId: string): MergeElementPick {
    const isIt = ({ id }: { readonly id: string }) => id === elementId;
    return elementPick(
        panePicks(states).find(isIt)?.pick,
        states.pickable.find(isIt)?.handMergeable ?? states.shapelessRows.find(isIt)?.handMergeable,
    );
}

/**
 * Every element the user's picks decide on a pane, once each: drawn with a
 * badge, picked but drawn by the partner alone, then a menu row the pane
 * lists in neither.
 */
export function panePicks(states: MergePanePickStates): readonly MergePickedElement[] {
    const picks = new Map<string, MergePickFields>();
    for (const { id, pick } of [
        ...states.badges.map((badge) => ({ id: badge.id, pick: badge })),
        ...states.picksNotDrawn.map((notDrawn) => ({ id: notDrawn.id, pick: notDrawn })),
        ...states.shapelessRows,
    ]) {
        if (pick !== undefined && !picks.has(id)) picks.set(id, pickOf(pick));
    }
    return [...picks].map(([id, pick]) => ({ id, pick }));
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
