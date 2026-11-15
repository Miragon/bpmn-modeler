import type { MergeDecisions } from "./mergeDecisions";
import { hasNoShape } from "./mergeElementShape";
import { paneMarking } from "./mergePaneView";
import { MERGE_SIDES, type MergeElement, type MergeSide } from "./mergeResult";

/** One element a merge pane's stepper walks to. */
export interface MergeStep {
    readonly id: string;
    /** No canvas draws it: the pane's legend lists it. */
    readonly shapeless: boolean;
    /** The pane's side holds the element, so the pane draws or lists it. */
    readonly onThisPane: boolean;
}

/** The stepper's two lists, both in navigation order: the open conflicts, and every element either pane marks. */
export interface MergePaneSteps {
    readonly openConflicts: readonly MergeStep[];
    readonly all: readonly MergeStep[];
}

/** Both panes get the same steps in the same order; only `onThisPane` differs. */
export function mergePaneSteps(
    decisions: MergeDecisions,
    navigationOrder: readonly string[],
    side: MergeSide,
): MergePaneSteps {
    const elementsById = new Map(decisions.result.elements.map((element) => [element.id, element]));
    const open = new Set(decisions.openConflicts.map(({ id }) => id));
    const marking = paneMarking(decisions);
    const ordered = navigationOrder.flatMap((id) => {
        const element = elementsById.get(id);
        return element === undefined ? [] : [element];
    });
    const stepOf = (element: MergeElement): MergeStep => ({
        id: element.id,
        shapeless: hasNoShape(element),
        onThisPane: element.versions[side] !== undefined,
    });
    return {
        openConflicts: ordered.filter(({ id }) => open.has(id)).map(stepOf),
        all: ordered
            .filter(
                (element) =>
                    open.has(element.id) ||
                    MERGE_SIDES.some((paneSide) => marking(element, paneSide) !== undefined),
            )
            .map(stepOf),
    };
}
