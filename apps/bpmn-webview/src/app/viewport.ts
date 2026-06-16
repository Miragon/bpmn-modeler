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
     * Fits the whole diagram into the viewport, centering it. Used on a fresh
     * file open (no saved viewbox) so a diagram authored far from the origin is
     * not rendered off-screen. bpmn-js does not auto-fit on importXML.
     */
    fitViewport(): void {
        this.getService<any>("canvas").zoom("fit-viewport", "auto");
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
