import type { DiffSide } from "@miragon/bpmn-modeler-diff";

import type { DecisionTableChanges, DmnDiffResult } from "./dmnDiffResult";

/**
 * Projects a {@link DmnDiffResult} onto the ids one pane renders: added
 * elements, columns and rules exist only on the after side, removed ones only
 * on the before side. Counts and navigation orders stay whole, so both panes
 * step through the same changes.
 */
export function dmnSideView(result: DmnDiffResult, side: DiffSide): DmnDiffResult {
    const keep = (ids: readonly string[], onlyOn: DiffSide) => (side === onlyOn ? ids : []);
    const table = (changes: DecisionTableChanges): DecisionTableChanges => ({
        ...changes,
        columns: {
            ...changes.columns,
            added: keep(changes.columns.added, "after"),
            removed: keep(changes.columns.removed, "before"),
        },
        rules: {
            ...changes.rules,
            added: keep(changes.rules.added, "after"),
            removed: keep(changes.rules.removed, "before"),
        },
    });
    return {
        ...result,
        added: keep(result.added, "after"),
        removed: keep(result.removed, "before"),
        tables: Object.fromEntries(
            Object.entries(result.tables).map(([id, changes]) => [id, table(changes)]),
        ),
    };
}
