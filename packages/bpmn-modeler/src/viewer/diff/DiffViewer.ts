import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";

import {
    DisposableStore,
    MIN_CANVAS_SIZE_PX,
    MutableDisposable,
    NoModelerError,
    Viewport,
    isUsableViewbox,
} from "@miragon/bpmn-modeler-types";

import { centreOf } from "../../elementGeometry";
import { armInitialViewportPolicy, InitialViewportLatch } from "../../initialViewport";
import { subscribeViewboxChanged } from "../../viewport";

/**
 * CSS class applied to each element category on the canvas.
 */
export type DiffMarkerClass =
    "diff-added" | "diff-removed" | "diff-changed" | "diff-layout-changed";

// CSS class applied to the element currently targeted by the stepper.
const DIFF_SELECTED_CLASS = "diff-selected";

/**
 * Readonly BPMN canvas for one side of a diff view.
 *
 * Wraps `bpmn-js/lib/NavigatedViewer` so the pane supports mouse + keyboard
 * pan/zoom but not editing. A destroyed pane throws {@link NoModelerError} from
 * every accessor.
 */
export class DiffViewer {
    private viewer: NavigatedViewer | undefined;

    private programmaticPositioningDepth = 0;

    /**
     * Id of the element currently highlighted as the stepper's focus, or
     * `undefined` when nothing is selected.  Tracked so {@link focusElement}
     * can remove the marker from the previous target before adding it to
     * the new one.
     */
    private selectedId: string | undefined;

    private readonly store = new DisposableStore();

    // Re-armed per importXML, so it can't be a plain store entry.
    private readonly sizeObserver = new MutableDisposable();

    // Keeps its own plain fit: ViewportManager's palette-inset fit would visibly change diff panes.
    private readonly latch = new InitialViewportLatch<Viewport>({
        applyViewport: (viewport) => {
            if (!this.isPaneSized()) {
                return false;
            }
            this.applyViewbox(viewport);
            return true;
        },
        fitViewport: () => this.fitViewport(),
    });

    constructor(container: HTMLElement) {
        try {
            this.viewer = new NavigatedViewer({ container });
        } catch (error) {
            // A partially-constructed bpmn-js attaches `.bjs-container` with no
            // handle to destroy; clear the dedicated container before rethrowing.
            container.replaceChildren();
            throw error;
        }
        this.store.add(() => {
            this.viewer?.destroy();
            this.viewer = undefined;
        });
        this.store.add(() => this.sizeObserver.dispose());
    }

    async importXML(xml: string): Promise<ImportXMLResult> {
        const result = await this.getViewer().importXML(xml);

        // Panes open side by side, so one regularly has no box yet when the
        // import lands; the fit retries until it does.
        const canvas = this.getCanvas();
        this.sizeObserver.set(
            armInitialViewportPolicy(canvas, {
                resetInitialViewportDecision: () => this.latch.reset(),
                applyInitialViewportOnce: () => this.latch.applyOnce(),
                fitViewport: () => this.fitViewport(),
            }),
        );

        return result;
    }

    /** Fits the diagram into the pane; `false` if it has no usable box yet. */
    private fitViewport(): boolean {
        if (!this.isPaneSized()) {
            return false;
        }
        this.getCanvas().zoom("fit-viewport", "auto");
        return true;
    }

    private isPaneSized(): boolean {
        const { outer } = this.getCanvas().viewbox();
        return outer.width >= MIN_CANVAS_SIZE_PX && outer.height >= MIN_CANVAS_SIZE_PX;
    }

    /**
     * Applies a marker class to each id, skipping ids absent from this canvas
     * (the partner pane may carry deliveries specific to its side).
     */
    applyHighlights(ids: readonly string[], klass: DiffMarkerClass): void {
        const canvas = this.getCanvas();
        const registry = this.getViewer().get<any>("elementRegistry");
        for (const id of ids) {
            if (registry.get(id)) {
                canvas.addMarker(id, klass);
            }
        }
    }

    /** Removes all diff markers (including the stepper selection) from the canvas. */
    clearHighlights(): void {
        const canvas = this.getCanvas();
        const registry = this.getViewer().get<any>("elementRegistry");
        const classes: string[] = [
            "diff-added",
            "diff-removed",
            "diff-changed",
            "diff-layout-changed",
            DIFF_SELECTED_CLASS,
        ];
        registry.forEach((element: { id: string }) => {
            for (const c of classes) {
                canvas.removeMarker(element.id, c);
            }
        });
        this.selectedId = undefined;
    }

    getViewport(): Viewport {
        const { x, y, width, height } = this.getCanvas().viewbox();
        return { x, y, width, height };
    }

    setViewport(viewport: Viewport): void {
        if (!isUsableViewbox(viewport)) {
            return;
        }
        // Applying onto a zero-sized pane blanks it; hold the box until a delivery
        // finds the pane laid out, and let it win over the pending initial fit.
        if (!this.isPaneSized()) {
            this.latch.hold(viewport);
            return;
        }
        this.applyViewbox(viewport);
        this.latch.markDecided();
    }

    private applyViewbox(viewport: Viewport): void {
        this.positionProgrammatically(() => this.getCanvas().viewbox({ ...viewport }));
    }

    /**
     * Subscribes to user-driven viewport changes; changes made during a
     * programmatic reposition are rejected (also cancelling a stale pending
     * notification) so the partner pane doesn't bounce the sync back. Returns a
     * disposer that unsubscribes and cancels the debounce.
     */
    onViewportChanged(cb: (viewport: Viewport) => void): () => void {
        return subscribeViewboxChanged<Viewport>({
            eventBus: this.getViewer().get("eventBus"),
            // Diff sync latency is unchanged from the hand-rolled version.
            debounceMs: 80,
            accept: () => this.programmaticPositioningDepth === 0,
            map: ({ x, y, width, height }) => ({ x, y, width, height }),
            onChange: cb,
        });
    }

    /**
     * Centres the viewport on the element with the given id and marks it as
     * the stepper's current selection.  Returns `true` if the element was
     * found on this canvas.
     *
     * Shapes carry `x/y/width/height`; connections (sequence flows, message
     * flows, associations) carry `waypoints` instead — in that case the
     * midpoint of the waypoint bbox is used.  Without this distinction edges
     * would centre at (0, 0) and produce a visible "reset" jump.
     */
    focusElement(id: string): boolean {
        if (!this.centerOnElement(id)) {
            return false;
        }
        const canvas = this.getCanvas();
        if (this.selectedId && this.selectedId !== id) {
            canvas.removeMarker(this.selectedId, DIFF_SELECTED_CLASS);
        }
        canvas.addMarker(id, DIFF_SELECTED_CLASS);
        this.selectedId = id;
        return true;
    }

    /**
     * Centres the viewport on `id` without touching the selection marker.
     * Used by the diff stepper to anchor the viewport on a surviving
     * neighbour when the target id only exists on the partner pane (e.g. a
     * removed element when this is the after pane).
     *
     * The cursor-sync channel already keeps the partner pane positioned (each
     * pane independently resolves the cursor against its own registry), so
     * re-emitting via viewport-sync would race the cursor sync and overwrite
     * the partner's correctly-focused viewbox with this pane's anchor position.
     */
    centerOnElement(id: string): boolean {
        const registry = this.getViewer().get<any>("elementRegistry");
        const element = registry.get(id);
        if (!element) {
            return false;
        }
        const centre = centreOf(element);
        if (!centre) {
            return false;
        }
        const canvas = this.getCanvas();
        const viewbox = canvas.viewbox();
        const root = canvas.findRoot(element);
        if (!root) {
            return false;
        }
        this.positionProgrammatically(() => {
            if (canvas.getRootElement() !== root) {
                canvas.setRootElement(root);
            }
            canvas.viewbox({
                x: centre.x - viewbox.width / 2,
                y: centre.y - viewbox.height / 2,
                width: viewbox.width,
                height: viewbox.height,
            });
        });
        return true;
    }

    /**
     * Returns `true` when `id` is present in this pane's element registry.
     */
    hasElement(id: string): boolean {
        const registry = this.getViewer().get<any>("elementRegistry");
        return !!registry.get(id);
    }

    /**
     * Removes the stepper-selection marker from whatever element currently
     * carries it.  Called when the stepper lands on an id that does not exist
     * on this pane: leaving the marker on the previous element would mislead
     * the user into thinking it is still the active step.
     */
    clearSelectionMarker(): void {
        if (!this.selectedId) {
            return;
        }
        this.getCanvas().removeMarker(this.selectedId, DIFF_SELECTED_CLASS);
        this.selectedId = undefined;
    }

    /**
     * Returns `true` if the element with the given id is a connection
     * (sequence flow, message flow, association) — i.e. carries waypoints
     * instead of shape bounds.  Used by the diff nav to filter out edges
     * whose only change is a waypoint adjustment, which are visually
     * redundant with the attached shape's change.
     */
    isConnection(id: string): boolean {
        const registry = this.getViewer().get<any>("elementRegistry");
        const element = registry.get(id);
        return !!element && Array.isArray(element.waypoints);
    }

    /**
     * Tears the pane down: disposes the canvas-size observer and destroys the
     * underlying bpmn-js viewer (detaches its DOM and event listeners) in
     * reverse order. Idempotent; a destroyed pane throws {@link NoModelerError}.
     */
    destroy(): void {
        this.store.dispose();
        this.viewer = undefined;
    }

    private getCanvas(): any {
        return this.getViewer().get<any>("canvas");
    }

    private getViewer(): NavigatedViewer {
        if (!this.viewer) {
            throw new NoModelerError();
        }
        return this.viewer;
    }

    // The synchronous viewbox/root events fired inside `action` are rejected by
    // the subscription guard, which also cancels a stale pending notification.
    private positionProgrammatically(action: () => void): void {
        this.programmaticPositioningDepth += 1;
        try {
            action();
        } finally {
            this.programmaticPositioningDepth -= 1;
        }
    }
}
