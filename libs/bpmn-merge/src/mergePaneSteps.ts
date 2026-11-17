import type { MergeDecisions } from "./mergeDecisions";
import { hasNoShape, subProcessPlaneOf } from "./mergeElementShape";
import { paneMarking } from "./mergePaneView";
import { MERGE_SIDES, type MergeElement, type MergeSide, otherSide } from "./mergeResult";

/** One element a merge pane's stepper walks to. */
export interface MergeStep {
    readonly id: string;
    /** No canvas draws it: the menu lists it. */
    readonly shapeless: boolean;
    /** The pane's side holds the element, so the pane draws or lists it. */
    readonly onThisPane: boolean;
    /** The other side holds the element, so the partner pane draws or lists it. */
    readonly onOtherPane: boolean;
    /** The sub-process whose plane draws it; absent on the plane a pane opens with. */
    readonly plane?: string;
}

/** The stepper's two lists, both in navigation order: the open conflicts, and every element either pane marks. */
export interface MergePaneSteps {
    readonly openConflicts: readonly MergeStep[];
    readonly all: readonly MergeStep[];
}

/** Both panes get the same steps in the same order; only `onThisPane` and `onOtherPane` differ. */
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
    const typeOf = (id: string) => elementsById.get(id)?.type;
    const stepOf = (element: MergeElement): MergeStep => {
        const plane = subProcessPlaneOf(element, typeOf);
        return {
            id: element.id,
            shapeless: hasNoShape(element),
            onThisPane: element.versions[side] !== undefined,
            onOtherPane: element.versions[otherSide(side)] !== undefined,
            ...(plane === undefined ? {} : { plane }),
        };
    };
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
