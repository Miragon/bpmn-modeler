import { MIN_CANVAS_SIZE_PX, isUsableViewbox } from "@miragon/bpmn-modeler-types";

import { centreOf } from "./elementGeometry";

/**
 * A canvas viewbox snapshot — the position and zoom {@link ViewportManager}
 * reads and restores. The host persists it (VS Code `setState`) alongside the
 * rest of its webview state.
 */
export interface ViewportData {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Persisted so the exact zoom survives a container-size change on restore. */
    scale?: number;
}

type ServiceAccessor = <T>(name: string) => T;

// Keep focused elements legible without zooming out from the current view.
const MIN_FOCUS_ZOOM = 0.75;

/** Reads, restores, and subscribes to canvas viewbox changes. */
export class ViewportManager {
    // An explicit setViewport/applyViewState with a usable box, or a successful
    // initial fit, decides the initial viewport; later observer deliveries must
    // not fit over that decision.
    private initialViewportDecided = false;

    // A usable box handed to setViewport before the container was laid out, held
    // until an observer delivery finds the canvas sized.
    private pendingViewport: ViewportData | undefined;

    constructor(private readonly getService: ServiceAccessor) {}

    /**
     * Returns the current canvas viewbox (position and zoom level).
     */
    getViewport(): ViewportData {
        const { x, y, width, height, scale } = this.getService<any>("canvas").viewbox();
        return { x, y, width, height, scale };
    }

    /**
     * Whether the host has laid the canvas out at a size worth fitting into.
     *
     * Every viewbox operation divides by these dimensions, so an unlaid-out
     * container yields a NaN transform, which SVG renders as nothing.
     */
    isCanvasSized(): boolean {
        const { outer } = this.getService<any>("canvas").viewbox();
        return outer.width >= MIN_CANVAS_SIZE_PX && outer.height >= MIN_CANVAS_SIZE_PX;
    }

    /**
     * Restores the canvas to a previously saved viewbox.
     *
     * Falls back to {@link fitViewport} for a box that cannot be applied
     * safely, which also recovers tabs whose persisted viewbox was written
     * while the canvas had no size.
     *
     * @param viewport The viewbox to apply.
     * @returns `false` if nothing was applied, so the caller can retry.
     */
    setViewport(viewport: ViewportData): boolean {
        if (!isUsableViewbox(viewport)) {
            const fitted = this.fitViewport();
            if (fitted) {
                this.markInitialViewportDecided();
            }
            return fitted;
        }
        if (!this.isCanvasSized()) {
            this.pendingViewport = viewport;
            return false;
        }
        const canvas = this.getService<any>("canvas");
        // Pin saved zoom explicitly because the container may have resized since capture.
        if (viewport.scale !== undefined && Number.isFinite(viewport.scale) && viewport.scale > 0) {
            const { outer } = canvas.viewbox();
            canvas.viewbox({
                x: viewport.x,
                y: viewport.y,
                width: outer.width / viewport.scale,
                height: outer.height / viewport.scale,
            });
        } else {
            canvas.viewbox(viewport);
        }
        this.markInitialViewportDecided();
        return true;
    }

    /**
     * The observer callback ({@link observeCanvasSize}) driving the initial fit.
     * Returns `true` immediately once the viewport has been decided, so an
     * explicit {@link setViewport}/`applyViewState` restore is never fitted over.
     * Otherwise it applies a viewport stashed by {@link setViewport} while the
     * canvas was unsized, or falls back to a fresh {@link fitViewport}.
     *
     * @returns `true` once the initial viewport is decided; `false` while the
     *   caller should keep retrying.
     */
    applyInitialViewportOnce(): boolean {
        if (this.initialViewportDecided) {
            return true;
        }
        const applied = this.pendingViewport
            ? this.setViewport(this.pendingViewport)
            : this.fitViewport();
        if (applied) {
            this.markInitialViewportDecided();
        }
        return applied;
    }

    /**
     * Re-arms the initial-viewport decision for a fresh diagram. Called by
     * `loadDiagram` before installing a new observer: a new diagram is a new
     * decision.
     */
    resetInitialViewportDecision(): void {
        this.initialViewportDecided = false;
        this.pendingViewport = undefined;
    }

    private markInitialViewportDecided(): void {
        this.initialViewportDecided = true;
        this.pendingViewport = undefined;
    }

    /**
     * Fits the diagram into the viewport on a fresh file open (no saved
     * viewbox) so a diagram authored far from the origin is not rendered
     * off-screen — bpmn-js does not auto-fit on importXML.
     *
     * bpmn-js's own `zoom("fit-viewport")` ignores the palette (left) and the
     * token-simulation / minimap controls (top), which are painted *on top of*
     * the canvas: centering pushes wide diagrams behind the palette, top-left
     * anchoring jams the diagram under both. So we fit into an inset area that
     * clears that chrome and center the diagram within it. The properties panel
     * is a flex sibling of the canvas, not an overlay, so it is already
     * excluded from `outer` and needs no inset.
     *
     * Scale is capped at 1.0 to match fit-to-page semantics — never zoom in.
     *
     * @returns `false` if nothing was applied, so the caller can retry.
     */
    fitViewport(): boolean {
        const canvas = this.getService<any>("canvas");
        const { inner, outer } = canvas.viewbox();

        // Fitting a zero-sized container would produce a NaN transform and blank the canvas.
        if (!this.isCanvasSized()) {
            return false;
        }

        if (!inner.width || !inner.height) {
            canvas.zoom("fit-viewport");
            return true;
        }

        // An unstyled palette can measure as full-width; cap insets so it cannot consume the viewport.
        const maxInsetX = outer.width / 4;
        const maxInsetY = outer.height / 4;
        const paletteWidth =
            canvas.getContainer().querySelector(".djs-palette")?.getBoundingClientRect().width ??
            50;
        const inset = {
            top: Math.min(40, maxInsetY),
            right: Math.min(40, maxInsetX),
            bottom: Math.min(40, maxInsetY),
            left: Math.min(paletteWidth + 20, maxInsetX),
        };

        const availableWidth = outer.width - inset.left - inset.right;
        const availableHeight = outer.height - inset.top - inset.bottom;

        const scale = Math.min(1, availableWidth / inner.width, availableHeight / inner.height);

        const marginX = inset.left + (availableWidth - inner.width * scale) / 2;
        const marginY = inset.top + (availableHeight - inner.height * scale) / 2;

        canvas.viewbox({
            x: inner.x - marginX / scale,
            y: inner.y - marginY / scale,
            width: outer.width / scale,
            height: outer.height / scale,
        });
        return true;
    }

    /**
     * Centres the viewport on `id`, enforcing {@link MIN_FOCUS_ZOOM}. Returns
     * `false` when the element is not on the canvas (e.g. a stale lint finding),
     * leaving the viewport untouched. Unlike the diff pane's variant it lets the
     * `viewbox.changed` event through, so the focused position is persisted.
     */
    centerOnElement(id: string): boolean {
        const canvas = this.getService<any>("canvas");
        const element = this.getService<any>("elementRegistry").get(id);
        if (!element) {
            return false;
        }
        const centre = centreOf(element);
        if (!centre) {
            return false;
        }

        const viewbox = canvas.viewbox();
        const scale = viewbox.width > 0 ? viewbox.outer.width / viewbox.width : MIN_FOCUS_ZOOM;
        const width = scale < MIN_FOCUS_ZOOM ? viewbox.outer.width / MIN_FOCUS_ZOOM : viewbox.width;
        const height =
            scale < MIN_FOCUS_ZOOM ? viewbox.outer.height / MIN_FOCUS_ZOOM : viewbox.height;

        canvas.viewbox({
            x: centre.x - width / 2,
            y: centre.y - height / 2,
            width,
            height,
        });
        return true;
    }

    /**
     * Subscribes to canvas viewbox changes with a 100 ms debounce.
     *
     * The debounce prevents a flood of state writes while the user is actively
     * panning or zooming; only the final position after the gesture is persisted.
     *
     * Degenerate viewboxes are dropped: persisting one makes the failure stick,
     * since every later rebuild of that tab would restore an unusable box.
     *
     * @param cb Callback invoked with the new {@link ViewportData} after each change.
     */
    onViewportChanged(cb: (viewport: ViewportData) => void): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        this.getService<any>("eventBus").on("canvas.viewbox.changed", (event: any) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const { x, y, width, height, scale } = event.viewbox;
                const viewport: ViewportData = { x, y, width, height, scale };
                if (isUsableViewbox(viewport)) {
                    cb(viewport);
                }
            }, 100);
        });
    }
}
