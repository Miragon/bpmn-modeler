import type { MergePaneStates, MergePickScope } from "@miragon/bpmn-modeler-shared";
import type { MergeMarker, MergeSide } from "@miragon/bpmn-modeler-types";

/** A marked element no canvas draws, as the merge menu lists it with its pick. */
export interface MergeShapelessRow {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
    readonly name?: string;
    /** The side the user's pick keeps it from; absent while no pick of the user decides it. */
    readonly keptSide?: MergeSide;
    /** What Undo takes back, set with `keptSide`. */
    readonly undo?: MergePickScope;
}

/**
 * The menu's rows for the pane's shape-less marks. No canvas draws a
 * shape-less element, so its pick is always among the picks the pane
 * cannot draw.
 */
export function mergeShapelessRows(
    states: Pick<MergePaneStates, "shapeless" | "picksNotDrawn" | "names">,
): MergeShapelessRow[] {
    return states.shapeless.map(({ id, type, marker }) => {
        const pick = states.picksNotDrawn.find((candidate) => candidate.id === id);
        const name = states.names[id];
        return {
            id,
            type,
            marker,
            ...(name === undefined ? {} : { name }),
            ...(pick === undefined ? {} : { keptSide: pick.keptSide, undo: pick.scope }),
        };
    });
}

/** The open conflicts no canvas draws, which only the menu lets the user decide. */
export function openShapelessConflicts(states: Pick<MergePaneStates, "openConflictSteps">): number {
    return states.openConflictSteps.filter((step) => step.shapeless).length;
}
