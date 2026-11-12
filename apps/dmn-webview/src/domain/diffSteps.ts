import type { DmnDiffView } from "@miragon/bpmn-modeler-shared";
import {
    DIFF_CATEGORIES,
    type DiffCounts,
    type DiffSide,
    nearestPresent,
} from "@miragon/bpmn-modeler-types";
import type { DmnDiffStatus } from "@miragon/dmn-modeler";

/** The changes a pane's stepper walks in the open view: the DRD's, or the open decision table's. */
export function stepsOf(view: DmnDiffView, elementId: string | null): readonly string[] {
    return elementId === null
        ? view.navigationOrder
        : (view.tables[elementId]?.navigationOrder ?? []);
}

/** The changes of the open view this pane's version has; the pane's view lists only those. */
export function presentIn(view: DmnDiffView, elementId: string | null): ReadonlySet<string> {
    if (elementId === null) {
        return new Set(DIFF_CATEGORIES.flatMap((category) => view[category]));
    }
    const table = view.tables[elementId];
    if (!table) {
        return new Set();
    }
    const { columns, rules } = table;
    return new Set([
        ...(table.attributesStep === undefined ? [] : [table.attributesStep]),
        ...columns.added,
        ...columns.removed,
        ...columns.changed,
        ...rules.added,
        ...rules.removed,
        ...rules.changed,
        ...rules.moved,
    ]);
}

/** A change to outline, or the change next to it a pane brings into view when its version lacks it. */
export type StepTarget = { readonly focus: string } | { readonly anchor: string | undefined };

export function targetAt(
    steps: readonly string[],
    present: ReadonlySet<string>,
    cursor: number,
    direction: 1 | -1,
): StepTarget {
    const id = steps[cursor];
    if (present.has(id)) {
        return { focus: id };
    }
    return {
        anchor: nearestPresent(steps, cursor, direction, (candidate) => present.has(candidate)),
    };
}

/** The legend's counts for the open view; a view without a changed table has none. */
export function countsOf(view: DmnDiffView, elementId: string | null): DiffCounts | undefined {
    return elementId === null ? view.counts : view.tables[elementId]?.counts;
}

/** How an element differs that the partner pane has open and this pane's version lacks. */
export type DmnMissingStatus = Exclude<DmnDiffStatus, "changed">;

/** The after pane lacks what was removed; the before pane lacks what was added. */
export function missingStatusOf(side: DiffSide): DmnMissingStatus {
    return side === "after" ? "removed" : "added";
}
