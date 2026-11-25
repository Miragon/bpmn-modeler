import { DEFAULT_THEME_MODE } from "@miragon/bpmn-modeler-types";
import { BpmnViewer } from "../viewer/service/viewer";
import type { ViewerOptions } from "../viewer/port/publicApi";
import { initOrTeardown } from "../kernel/service/surfaceLifecycle";
import { kernelDefaultModules } from "./kernelDefaults";

/**
 * Async for API-stability symmetry with {@link createModeler}.
 */
export async function createViewer(
    container: HTMLElement,
    options: ViewerOptions = {},
): Promise<BpmnViewer> {
    return initOrTeardown(
        () => new BpmnViewer(container, options, { defaultModules: kernelDefaultModules() }),
        async (viewer) => {
            await viewer.init();

            // Always engage theming so the per-instance `data-bpmn-theme` attribute is
            // set from the first frame; `"automatic"` then follows `prefers-color-scheme`.
            viewer.setTheme(options.theme ?? DEFAULT_THEME_MODE);
        },
    );
}
