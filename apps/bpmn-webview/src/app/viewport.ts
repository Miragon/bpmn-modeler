import { MIN_CANVAS_SIZE_PX, isUsableViewbox } from "@miragon/bpmn-modeler-shared";

import { ViewportData } from "./webviewState";

/**
 * Function type for accessing a service from the bpmn-js DI container.
 *
 * @template T The service type to retrieve.
 * @param name The DI service name.
 */
type ServiceAccessor = <T>(name: string) => T;

/**
 * Reads, writes, and subscribes to canvas viewbox changes.
 *
 * Decoupled from the modeler through a {@link ServiceAccessor} so the
 * viewport concern can be tested and composed independently.
 */
export class ViewportManager {
    constructor(private readonly getService: ServiceAccessor) {}

    /**
     * Returns the current canvas viewbox (position and zoom level).
     */
    getViewport(): ViewportData {
        const { x, y, width, height } = this.getService<any>("canvas").viewbox();
        return { x, y, width, height };
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
        if (!isUsableViewbox(viewport) || !this.isCanvasSized()) {
            return this.fitViewport();
        }
        this.getService<any>("canvas").viewbox(viewport);
        return true;
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

        // Leaving bpmn-js's identity transform alone keeps the diagram
        // visible, just not centred; fitting against an unlaid-out container
        // would divide by it and blank the canvas instead.
        if (!this.isCanvasSized()) {
            return false;
        }

        // No elements — nothing to fit; let bpmn-js handle the degenerate case.
        if (!inner.width || !inner.height) {
            canvas.zoom("fit-viewport");
            return true;
        }

        // Insets are margins, not hard constraints. A palette whose stylesheet
        // has not been applied yet measures as a full-width block, which would
        // swallow the viewport and shrink the diagram to nothing; capping each
        // inset keeps half the canvas available whatever the chrome reports.
        const maxInsetX = outer.width / 4;
        const maxInsetY = outer.height / 4;
        const paletteWidth =
            document.querySelector(".djs-palette")?.getBoundingClientRect().width ?? 50;
        const inset = {
            top: Math.min(40, maxInsetY),
            right: Math.min(40, maxInsetX),
            bottom: Math.min(40, maxInsetY),
            left: Math.min(paletteWidth + 20, maxInsetX),
        };

        const availableWidth = outer.width - inset.left - inset.right;
        const availableHeight = outer.height - inset.top - inset.bottom;

        const scale = Math.min(1, availableWidth / inner.width, availableHeight / inner.height);

        // Center the diagram inside the inset area: split the leftover space
        // evenly, then shift by the inset so each side keeps its own margin.
        const marginX = inset.left + (availableWidth - inner.width * scale) / 2;
        const marginY = inset.top + (availableHeight - inner.height * scale) / 2;

        // Map diagram-space to a viewbox so the diagram's top-left lands at
        // (marginX, marginY) px; box width/height pin the resulting scale.
        canvas.viewbox({
            x: inner.x - marginX / scale,
            y: inner.y - marginY / scale,
            width: outer.width / scale,
            height: outer.height / scale,
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
                const { x, y, width, height } = event.viewbox;
                const viewport = { x, y, width, height };
                if (isUsableViewbox(viewport)) {
                    cb(viewport);
                }
            }, 100);
        });
    }
}
