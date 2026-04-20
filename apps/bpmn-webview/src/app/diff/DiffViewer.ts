import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";

import { Viewport } from "@bpmn-modeler/shared";

/** CSS class applied to each element category on the canvas. */
export type DiffMarkerClass =
    | "diff-added"
    | "diff-removed"
    | "diff-changed"
    | "diff-layout-changed";

/** CSS class applied to the element currently targeted by the stepper. */
const DIFF_SELECTED_CLASS = "diff-selected";

/**
 * Readonly BPMN canvas for one side of a diff view.
 *
 * Wraps `bpmn-js/lib/NavigatedViewer` so the pane supports mouse + keyboard
 * pan/zoom but not editing.  Exposes:
 *   - {@link importXML} — load the diagram and fit to viewport.
 *   - {@link applyHighlights} — mark elements with per-category CSS classes.
 *   - {@link getViewport} / {@link setViewport} — read/write canvas viewbox.
 *   - {@link onViewportChanged} — subscribe to user-driven viewport changes,
 *     with a suppression guard so programmatic `setViewport` calls don't
 *     re-emit (avoids feedback loops across synced panes).
 *   - {@link focusElement} — centre the viewport on a given element.
 */
export class DiffViewer {
    private readonly viewer: NavigatedViewer;

    /**
     * When `true`, the next viewbox-change event is ignored.  Set by
     * {@link setViewport} so an incoming viewport sync doesn't bounce back.
     */
    private suppressNextChangeEvent = false;

    /**
     * Id of the element currently highlighted as the stepper's focus, or
     * `undefined` when nothing is selected.  Tracked so {@link focusElement}
     * can remove the marker from the previous target before adding it to
     * the new one.
     */
    private selectedId: string | undefined;

    constructor(container: string) {
        this.viewer = new NavigatedViewer({ container });
    }

    async importXML(xml: string): Promise<ImportXMLResult> {
        const result = await this.viewer.importXML(xml);
        this.getCanvas().zoom("fit-viewport", "auto");
        return result;
    }

    /**
     * Applies a marker CSS class to each id in `ids`.  Silently skips ids
     * that do not exist on this canvas (the partner pane may have deliveries
     * specific to its side).
     */
    applyHighlights(ids: readonly string[], klass: DiffMarkerClass): void {
        const canvas = this.getCanvas();
        const registry = this.viewer.get<any>("elementRegistry");
        for (const id of ids) {
            if (registry.get(id)) {
                canvas.addMarker(id, klass);
            }
        }
    }

    /** Removes all diff markers (including the stepper selection) from the canvas. */
    clearHighlights(): void {
        const canvas = this.getCanvas();
        const registry = this.viewer.get<any>("elementRegistry");
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
        this.suppressNextChangeEvent = true;
        this.getCanvas().viewbox({ ...viewport });
    }

    /**
     * Subscribes to user-driven viewport changes.  Calls to
     * {@link setViewport} are filtered out by the internal suppression
     * guard so the partner pane doesn't bounce the sync back.
     */
    onViewportChanged(cb: (viewport: Viewport) => void): void {
        let debounceTimer: ReturnType<typeof setTimeout> | undefined;
        this.viewer.get<any>("eventBus").on(
            "canvas.viewbox.changed",
            (event: any) => {
                if (this.suppressNextChangeEvent) {
                    this.suppressNextChangeEvent = false;
                    return;
                }
                const { x, y, width, height } = event.viewbox;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(
                    () => cb({ x, y, width, height }),
                    80,
                );
            },
        );
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
     * Sets {@link suppressNextChangeEvent} so the resulting viewbox change
     * does NOT emit `ViewportChangedCommand`.  The cursor-sync channel
     * already keeps the partner pane positioned (each pane independently
     * resolves the cursor against its own registry), so re-emitting via
     * viewport-sync would race the cursor sync and overwrite the partner's
     * correctly-focused viewbox with this pane's anchor position.
     */
    centerOnElement(id: string): boolean {
        const registry = this.viewer.get<any>("elementRegistry");
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
        this.suppressNextChangeEvent = true;
        canvas.viewbox({
            x: centre.x - viewbox.width / 2,
            y: centre.y - viewbox.height / 2,
            width: viewbox.width,
            height: viewbox.height,
        });
        return true;
    }

    /** Returns `true` when `id` is present in this pane's element registry. */
    hasElement(id: string): boolean {
        const registry = this.viewer.get<any>("elementRegistry");
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
        const registry = this.viewer.get<any>("elementRegistry");
        const element = registry.get(id);
        return !!element && Array.isArray(element.waypoints);
    }

    private getCanvas(): any {
        return this.viewer.get<any>("canvas");
    }
}

/**
 * Returns the geometric centre of a bpmn-js element, or `undefined` when the
 * element has neither shape bounds nor waypoints to derive a position from.
 */
function centreOf(
    element: {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
        waypoints?: ReadonlyArray<{ x: number; y: number }>;
    },
): { x: number; y: number } | undefined {
    if (typeof element.x === "number" && typeof element.y === "number") {
        return {
            x: element.x + (element.width ?? 0) / 2,
            y: element.y + (element.height ?? 0) / 2,
        };
    }
    const wps = element.waypoints;
    if (wps && wps.length > 0) {
        let minX = wps[0].x;
        let maxX = wps[0].x;
        let minY = wps[0].y;
        let maxY = wps[0].y;
        for (let i = 1; i < wps.length; i++) {
            const p = wps[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    return undefined;
}
