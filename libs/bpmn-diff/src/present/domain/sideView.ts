import { DiffResult, DiffSide, DiffSideView } from "./diffResult";

/**
 * Projects a {@link DiffResult} onto the ids that actually exist on one pane's
 * canvas.  `added` elements exist only on the *after* side and `removed` only
 * on the *before* side, so each is blanked for the side it does not belong to;
 * `changed` and `layoutChanged` exist on both and pass through unchanged.
 */
export function sideView(result: DiffResult, side: DiffSide): DiffSideView {
    return {
        added: side === "after" ? result.added : [],
        removed: side === "before" ? result.removed : [],
        changed: result.changed,
        layoutChanged: result.layoutChanged,
    };
}
