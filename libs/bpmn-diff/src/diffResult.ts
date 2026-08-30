/**
 * Which side of the diff a pane or {@link DiffSideView} represents.
 */
export type DiffSide = "before" | "after";

/**
 * Summary counts across the four diff categories, used for the legend chip.
 */
export interface DiffCounts {
    readonly added: number;
    readonly removed: number;
    readonly changed: number;
    readonly layoutChanged: number;
}

/**
 * Serializable (plain JSON) result of comparing two BPMN XML documents.
 *
 * Every field is a flat array of element ids or a numeric count, so the whole
 * value survives `JSON.parse(JSON.stringify(result))` unchanged — it crosses
 * the webview↔host boundary and can be cached, logged, or diffed as data.
 *
 * The id arrays are ordered by BPMN sequence-flow position (start event → end
 * event) rather than the differ's arbitrary insertion order:
 *   - `added` / `changed` / `layoutChanged` follow the *after* diagram's order.
 *   - `removed` elements exist only on the *before* diagram, so each is
 *     anchored next to a surviving neighbour's position in the after order.
 */
export interface DiffResult {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
    readonly layoutChanged: readonly string[];
    readonly counts: DiffCounts;
    /**
     * Merged, deduped, flow-sorted union of all four categories — the order a
     * stepper walks so removed elements interleave with added/changed at their
     * anchored positions instead of sitting in their own block.
     */
    readonly navigationOrder: readonly string[];
}

/**
 * One pane's slice of a {@link DiffResult}: the ids that actually exist on that
 * side's canvas. `added` ids exist only on the *after* canvas and `removed`
 * ids only on the *before* canvas, so {@link sideView} blanks whichever does
 * not apply to the requested side. `changed`/`layoutChanged` exist on both.
 */
export interface DiffSideView {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
    readonly layoutChanged: readonly string[];
}
