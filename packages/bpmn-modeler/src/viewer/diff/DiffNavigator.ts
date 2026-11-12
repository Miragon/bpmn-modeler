import { DiffSideView, layoutOnlyEdgeIds } from "@miragon/bpmn-modeler-diff";
import { canStep, nearestPresent, stepCursor } from "@miragon/bpmn-modeler-types";

import { DiffViewer } from "./DiffViewer";

/**
 * Portable diff-stepper logic for a single {@link DiffViewer} pane.
 *
 * Owns the navigable cycle and cursor for one canvas: it walks the diff's
 * navigation order bidirectionally, focusing the current element or, when the
 * target lives only on the partner pane, anchoring on a surviving neighbour.
 *
 * This is the shared core reused by both the in-page {@link DiffPaneCoordinator}
 * and the host-relayed `DiffMode` protocol glue — neither re-implements
 * `findAnchor`/cursor logic. It is transport-agnostic: it never posts messages;
 * emitting cursor changes to a partner pane is the caller's concern.
 */
export class DiffNavigator {
    private changeIds: readonly string[] = [];

    private _cursor = -1;

    constructor(private readonly viewer: DiffViewer) {}

    /**
     * Rebuilds the navigable cycle from the diff's `navigationOrder` and resets
     * the cursor. The order already leaves out connections whose only change
     * is layout, so the cycle is the order as given.
     */
    setChanges(navigationOrder: readonly string[]): void;
    /**
     * @deprecated Pass only the navigation order. With a side view, the cycle
     * also leaves out the view's layout-only connections, for a navigation
     * order that still lists them.
     */
    setChanges(view: DiffSideView, navigationOrder: readonly string[]): void;
    setChanges(
        viewOrNavigationOrder: DiffSideView | readonly string[],
        navigationOrder: readonly string[] = [],
    ): void {
        if (isNavigationOrder(viewOrNavigationOrder)) {
            this.changeIds = viewOrNavigationOrder;
        } else {
            const skipped = layoutOnlyEdgeIds(viewOrNavigationOrder, (id) =>
                this.viewer.isConnection(id),
            );
            this.changeIds = navigationOrder.filter((id) => !skipped.has(id));
        }
        this._cursor = -1;
    }

    /** Whether Next and Previous have a change to step to. */
    get canStep(): boolean {
        return canStep(this.changeIds);
    }

    get cursor(): number {
        return this._cursor;
    }

    get cycleLength(): number {
        return this.changeIds.length;
    }

    /**
     * Steps the cursor one position in `direction` (wrapping around) and
     * applies it.  Returns the new cursor index, or `undefined` when the cycle
     * is empty.
     */
    advance(direction: 1 | -1): number | undefined {
        if (this.changeIds.length === 0) {
            return undefined;
        }
        const next = stepCursor(this._cursor, direction, this.changeIds.length);
        this.applyCursor(next, direction);
        return this._cursor;
    }

    /**
     * Moves the cursor to `index` and either focuses the target (it exists on
     * this canvas) or anchors on the nearest surviving neighbour (the target is
     * partner-only, e.g. a removed element on the after pane).
     *
     * `direction` biases the anchor walk towards the user's step direction; an
     * incoming sync leaves it at the default forward search since the partner
     * already chose the canonical direction.
     *
     * Returns `true` if the target was focused on this canvas, `false` if it
     * had to anchor (or the cycle is empty).
     */
    applyCursor(index: number, direction: 1 | -1 = 1): boolean {
        if (this.changeIds.length === 0) {
            return false;
        }
        this._cursor = index;
        const targetId = this.changeIds[this._cursor];

        if (this.viewer.focusElement(targetId)) {
            return true;
        }

        // Target id lives only on the partner pane.  Centre on the nearest
        // neighbour in the cycle that exists here — the viewbox move then
        // propagates via viewport-sync so the partner pane brings the actual
        // element into view with its diff highlight.  Without this anchoring the
        // stepper appears frozen whenever the cursor lands on a partner-only id.
        const anchor = nearestPresent(this.changeIds, this._cursor, direction, (id) =>
            this.viewer.hasElement(id),
        );
        if (anchor !== undefined) {
            this.viewer.centerOnElement(anchor);
        }
        this.viewer.clearSelectionMarker();
        return false;
    }
}

// Array.isArray does not narrow a union with a readonly array.
function isNavigationOrder(value: DiffSideView | readonly string[]): value is readonly string[] {
    return Array.isArray(value);
}
