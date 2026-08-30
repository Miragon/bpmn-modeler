import { DiffResult, sideView } from "@miragon/bpmn-modeler-diff";

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
 *   - steps a single shared cursor across both navigators.
 *
 * The shared cursor is sound because both panes navigate the same
 * `navigationOrder` and prune the same layout-only connections (which exist on
 * both canvases), so their cycles have identical length — the same
 * symmetric-cycle invariant the relayed protocol relies on.
 *
 * Consumers own the {@link DiffViewer} lifecycle; {@link destroy} only unhooks
 * the viewport subscriptions this coordinator armed.
 */
export class DiffPaneCoordinator {
    private readonly beforeNav: DiffNavigator;

    private readonly afterNav: DiffNavigator;

    private readonly disposers: readonly (() => void)[];

    private _cursor = -1;

    constructor(
        private readonly before: DiffViewer,
        private readonly after: DiffViewer,
    ) {
        this.beforeNav = new DiffNavigator(before);
        this.afterNav = new DiffNavigator(after);
        this.disposers = [
            before.onViewportChanged((viewport) => after.setViewport(viewport)),
            after.onViewportChanged((viewport) => before.setViewport(viewport)),
        ];
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
            viewer.applyHighlights(view.added, "diff-added");
            viewer.applyHighlights(view.removed, "diff-removed");
            viewer.applyHighlights(view.changed, "diff-changed");
            viewer.applyHighlights(view.layoutChanged, "diff-layout-changed");
            nav.setChanges(view, result.navigationOrder);
        }
    }

    /** Advances the shared cursor to the next changed element on both panes. */
    next(): void {
        this.step(1);
    }

    /** Advances the shared cursor to the previous changed element on both panes. */
    previous(): void {
        this.step(-1);
    }

    get cursor(): number {
        return this._cursor;
    }

    /** Unhooks the viewport-sync subscriptions.  Leaves the viewers intact. */
    destroy(): void {
        for (const dispose of this.disposers) {
            dispose();
        }
    }

    private step(direction: 1 | -1): void {
        const len = this.beforeNav.cycleLength;
        if (len === 0) {
            return;
        }
        this._cursor = (this._cursor + direction + len) % len;
        this.beforeNav.applyCursor(this._cursor, direction);
        this.afterNav.applyCursor(this._cursor, direction);
    }
}
