import { BpmnViewer } from "./viewer";
import type { ViewerOptions } from "./publicApi";
import { createSurface } from "../createSurface";

/**
 * Async for API-stability symmetry with {@link createModeler}.
 */
export async function createViewer(
    container: HTMLElement,
    options: ViewerOptions = {},
): Promise<BpmnViewer> {
    return createSurface(
        () => new BpmnViewer(container, options),
        async (viewer) => {
            await viewer.init();

            // Always engage theming so the per-instance `data-bpmn-theme` attribute is
            // set from the first frame; `"automatic"` then follows `prefers-color-scheme`.
            viewer.setTheme(options.theme ?? "automatic");
        },
    );
}
