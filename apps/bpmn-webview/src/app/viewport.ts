import { ViewportData } from "./vscode";

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
     * Restores the canvas to a previously saved viewbox.
     *
     * @param viewport The viewbox to apply.
     */
    setViewport(viewport: ViewportData): void {
        this.getService<any>("canvas").viewbox(viewport);
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
     */
    fitViewport(): void {
        const canvas = this.getService<any>("canvas");
        const { inner, outer } = canvas.viewbox();

        // No elements (or canvas not laid out yet) — nothing to fit; let
        // bpmn-js handle the degenerate case.
        if (!inner.width || !inner.height || !outer.width || !outer.height) {
            canvas.zoom("fit-viewport");
            return;
        }

        const paletteWidth =
            document.querySelector(".djs-palette")?.getBoundingClientRect().width ?? 50;
        const inset = { top: 40, right: 40, bottom: 40, left: paletteWidth + 20 };

        const availableWidth = Math.max(1, outer.width - inset.left - inset.right);
        const availableHeight = Math.max(1, outer.height - inset.top - inset.bottom);

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
    }

    /**
     * Subscribes to canvas viewbox changes with a 100 ms debounce.
     *
     * The debounce prevents a flood of state writes while the user is actively
     * panning or zooming; only the final position after the gesture is persisted.
     *
     * @param cb Callback invoked with the new {@link ViewportData} after each change.
     */
    onViewportChanged(cb: (viewport: ViewportData) => void): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        this.getService<any>("eventBus").on("canvas.viewbox.changed", (event: any) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const { x, y, width, height } = event.viewbox;
                cb({ x, y, width, height });
            }, 100);
        });
    }
}
