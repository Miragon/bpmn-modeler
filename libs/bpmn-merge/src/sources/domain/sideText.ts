import type { ElementSnapshot } from "@miragon/bpmn-modeler-diff";

import type { HandMergedVersion } from "../../decide/domain/handMerge";
import type { MergeSide } from "../../kernel/domain/mergeResult";

/** What a side writes of an element's own text. */
export interface SideText {
    readonly content: string;
    /** The start tag's attributes by name, as `ElementSnapshot.attributes` writes them. */
    readonly attributes: Readonly<Record<string, string>>;
}

/** A name as a view shows it: a blank one names nothing. */
export function shownNameOf(name: unknown): string | undefined {
    return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

/** Whether `handMerge` stands for its element's version on `side`. */
function standsFor(
    handMerge: HandMergedVersion | undefined,
    side: MergeSide,
): handMerge is HandMergedVersion {
    return handMerge?.side === side;
}

/** The side's text of the element: its version merged by hand, else its snapshot's; none where the side lacks it. */
export function sideTextOf(
    snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>,
    handMerge: HandMergedVersion | undefined,
    id: string,
    side: MergeSide,
): SideText | undefined {
    if (standsFor(handMerge, side)) return handMerge;
    const snapshot = snapshots[side].get(id);
    return snapshot === undefined
        ? undefined
        : { content: snapshot.content, attributes: snapshot.attributes };
}

/** The side's name of the element, by its version merged by hand where one stands, as `shownNameOf` reads it. */
export function sideNameOf(
    names: Readonly<Record<MergeSide, ReadonlyMap<string, string>>>,
    handMerge: HandMergedVersion | undefined,
    id: string,
    side: MergeSide,
): string | undefined {
    return standsFor(handMerge, side)
        ? shownNameOf(handMerge.attributes["name"])
        : names[side].get(id);
}
