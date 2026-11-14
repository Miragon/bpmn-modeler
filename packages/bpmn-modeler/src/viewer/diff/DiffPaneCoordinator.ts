import { DiffResult, type DiffSide, sideView } from "@miragon/bpmn-modeler-diff";
import {
    DIFF_CATEGORIES,
    DIFF_MARKERS,
    DisposableStore,
    stepCursor,
    type Viewport,
} from "@miragon/bpmn-modeler-types";

import { DiffNavigator } from "./DiffNavigator";
import { DiffViewer } from "./DiffViewer";

/**
 * In-page coordinator for a two-pane BPMN diff — the host-free counterpart to
 * the VS Code / IntelliJ relayed `SyncViewportQuery`/`SyncCursorQuery` protocol.
 *
 * Given two {@link DiffViewer}s already showing the before/after diagrams, it:
 *   - arms viewport lockstep in both directions (each pane's user-driven
 *     pan/zoom drives the partner's viewport; {@link DiffViewer}'s suppression
 *     guard kills the echo so the sync never ping-pongs);
 *   - paints each pane with its side's highlights and builds a
 *     {@link DiffNavigator} per pane from one {@link DiffResult};
 *   - steps a single shared cursor across both navigators;
 *   - takes each pane into the plane the user enters on its partner.
 *
 * The shared cursor is sound because both panes navigate the same
 * `navigationOrder`, so their cycles have identical length — the same
 * symmetric-cycle invariant the relayed protocol relies on.
 *
 * Consumers own the {@link DiffViewer} lifecycle; {@link destroy} only unhooks
 * the viewport subscriptions this coordinator armed.
 */
export class DiffPaneCoordinator {
    private readonly beforeNav: DiffNavigator;

    private readonly afterNav: DiffNavigator;

    private readonly store = new DisposableStore();

    private readonly planeListeners = new Set<(side: DiffSide, missing: boolean) => void>();

    // Whether a side's version lacks the plane the user entered on the other side.
    private readonly planeMissing = { before: false, after: false };

    private _cursor = -1;

    constructor(
        private readonly before: DiffViewer,
        private readonly after: DiffViewer,
    ) {
        this.beforeNav = new DiffNavigator(before);
        this.afterNav = new DiffNavigator(after);
        this.store.add(
            before.onViewportChanged((viewport) => this.syncViewport(after, viewport)),
            after.onViewportChanged((viewport) => this.syncViewport(before, viewport)),
            before.onPlaneChanged((planeId) => this.syncPlane("before", planeId)),
            after.onPlaneChanged((planeId) => this.syncPlane("after", planeId)),
        );
    }

    /**
     * Paints both panes from one {@link DiffResult} and rebuilds both
     * navigation cycles.  Each pane receives only the ids on its own canvas
     * (added on after, removed on before; changed/layoutChanged on both).
     * Resets the shared cursor.
     */
    apply(result: DiffResult): void {
        this._cursor = -1;
        const panes = [
            { viewer: this.before, nav: this.beforeNav, view: sideView(result, "before") },
            { viewer: this.after, nav: this.afterNav, view: sideView(result, "after") },
        ] as const;
        for (const { viewer, nav, view } of panes) {
            viewer.clearHighlights();
            for (const category of DIFF_CATEGORIES) {
                viewer.applyHighlights(view[category], DIFF_MARKERS[category]);
            }
            nav.setChanges(result.navigationOrder);
        }
    }

    next(): void {
        this.step(1);
    }

    previous(): void {
        this.step(-1);
    }

    get cursor(): number {
        return this._cursor;
    }

    /** Whether Next and Previous have a change to step to; pass it to each pane's legend. */
    get canStep(): boolean {
        return this.beforeNav.canStep;
    }

    /** Takes both panes back to the whole diagram, before the first change. */
    reset(): void {
        this.clearPlaneMissing();
        this._cursor = -1;
        this.beforeNav.reset();
        this.afterNav.reset();
    }

    /** How many changes Next and Previous cycle through; pass it to a legend's `position`. */
    get cycleLength(): number {
        return this.beforeNav.cycleLength;
    }

    /**
     * Calls back with each side's state whenever the planes move: `missing`
     * is `true` while that side's version lacks the plane the user entered on
     * the other side, and its label can say so.
     */
    onPlaneMissingChanged(listener: (side: DiffSide, missing: boolean) => void): () => void {
        this.planeListeners.add(listener);
        return () => this.planeListeners.delete(listener);
    }

    destroy(): void {
        this.store.dispose();
        this.planeListeners.clear();
    }

    private syncPlane(source: DiffSide, planeId: string): void {
        const partner: DiffSide = source === "before" ? "after" : "before";
        const found = this.viewerOf(partner).showPlane(planeId);
        this.setPlaneMissing(source, false);
        this.setPlaneMissing(partner, !found);
    }

    // Panes on different planes would map one plane's coordinates onto another.
    private syncViewport(target: DiffViewer, viewport: Viewport): void {
        if (!this.planeMissing.before && !this.planeMissing.after) {
            target.setViewport(viewport);
        }
    }

    private clearPlaneMissing(): void {
        this.setPlaneMissing("before", false);
        this.setPlaneMissing("after", false);
    }

    private setPlaneMissing(side: DiffSide, missing: boolean): void {
        this.planeMissing[side] = missing;
        this.planeListeners.forEach((listener) => listener(side, missing));
    }

    private viewerOf(side: DiffSide): DiffViewer {
        return side === "before" ? this.before : this.after;
    }

    private step(direction: 1 | -1): void {
        const len = this.beforeNav.cycleLength;
        if (len === 0) {
            return;
        }
        this.clearPlaneMissing();
        this._cursor = stepCursor(this._cursor, direction, len);
        this.beforeNav.applyCursor(this._cursor, direction);
        this.afterNav.applyCursor(this._cursor, direction);
    }
}
