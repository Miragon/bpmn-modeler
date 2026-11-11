import type { DmnDiffView } from "@miragon/bpmn-modeler-shared";
import { type DiffCounts, nearestPresent } from "@miragon/bpmn-modeler-types";

/** The changes a pane's stepper walks in the open view: the DRD's, or the open decision table's. */
export function stepsOf(view: DmnDiffView, elementId: string | null): readonly string[] {
    return elementId === null
        ? view.navigationOrder
        : (view.tables[elementId]?.navigationOrder ?? []);
}

/**
 * The changes of the open view this pane's version has. The pane's view lists
 * only those, and a changed table puts its own id first in its order.
 */
export function presentIn(view: DmnDiffView, elementId: string | null): ReadonlySet<string> {
    if (elementId === null) {
        return new Set([...view.added, ...view.removed, ...view.changed, ...view.layoutChanged]);
    }
    const table = view.tables[elementId];
    if (!table) {
        return new Set();
    }
    const { columns, rules } = table;
    return new Set([
        ...(table.properties.length > 0 ? table.navigationOrder.slice(0, 1) : []),
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

/** How the open element differs, for a view without a table to mark. */
export function statusOf(
    view: DmnDiffView,
    elementId: string,
): "added" | "removed" | "changed" | undefined {
    if (view.added.includes(elementId)) return "added";
    if (view.removed.includes(elementId)) return "removed";
    if (view.expressions.includes(elementId)) return "changed";
    return undefined;
}
