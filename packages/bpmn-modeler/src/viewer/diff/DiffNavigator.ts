import { DiffSideView } from "@miragon/bpmn-modeler-diff";

import { DiffViewer } from "./DiffViewer";

/**
 * Portable diff-stepper logic for a single {@link DiffViewer} pane.
 *
 * Owns the navigable cycle and cursor for one canvas: it prunes layout-only
 * connections out of the navigation order, focuses the current element (or
 * anchors on a surviving neighbour when the target lives only on the partner
 * pane), and walks the cycle bidirectionally.
 *
 * This is the shared core reused by both the in-page {@link DiffPaneCoordinator}
 * and the host-relayed `DiffMode` protocol glue — neither re-implements
 * `findAnchor`/cursor logic. It is transport-agnostic: it never posts messages;
 * emitting cursor changes to a partner pane is the caller's concern.
 */
export class DiffNavigator {
    /**
     * Ids this pane can navigate to, in flow order.  Populated by
     * {@link setChanges} from the shared navigation order minus layout-only
     * connections.
     */
    private changeIds: readonly string[] = [];

    private _cursor = -1;

    constructor(private readonly viewer: DiffViewer) {}

    /**
     * Rebuilds the navigable cycle from a side view and the shared navigation
     * order, then resets the cursor.
     *
     * Connections whose *only* change is `layoutChanged` are dropped: that
     * happens when a task moves and its incoming/outgoing flows get new
     * waypoints as a side-effect.  The flow carries no semantic change of its
     * own, and the user already sees it highlighted when the attached shape
     * comes up in the cycle.
     */
    setChanges(view: DiffSideView, navigationOrder: readonly string[]): void {
        const semanticIds = new Set<string>([...view.removed, ...view.added, ...view.changed]);
        const isLayoutOnlyConnection = (id: string): boolean =>
            !semanticIds.has(id) && view.layoutChanged.includes(id) && this.viewer.isConnection(id);

        this.changeIds = navigationOrder.filter((id) => !isLayoutOnlyConnection(id));
        this._cursor = -1;
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
        const next = (this._cursor + direction + this.changeIds.length) % this.changeIds.length;
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
        const anchor = this.findAnchor(this._cursor, direction);
        if (anchor !== undefined) {
            this.viewer.centerOnElement(anchor);
        }
        this.viewer.clearSelectionMarker();
        return false;
    }

    /**
     * Walks outward from `cursor`, preferring `direction`, to locate an id
     * present on this pane.  Returns `undefined` only in the degenerate case
     * where every id in the cycle lives exclusively on the partner pane.
     */
    private findAnchor(cursor: number, direction: 1 | -1): string | undefined {
        const len = this.changeIds.length;
        for (let i = 1; i < len; i++) {
            for (const dir of [direction, -direction] as const) {
                const idx = (((cursor + dir * i) % len) + len) % len;
                const id = this.changeIds[idx];
                if (this.viewer.hasElement(id)) {
                    return id;
                }
            }
        }
        return undefined;
    }
}
