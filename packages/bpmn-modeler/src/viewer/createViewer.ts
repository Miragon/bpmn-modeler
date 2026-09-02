import { BpmnViewer } from "./viewer";
import type { ViewerOptions } from "./publicApi";

/**
 * Stands up one independent readonly viewer bound to `container`, then engages
 * theming. Mirrors {@link createModeler} minus the editor-only setup (i18n,
 * element templates, settings) — a viewer has no translatable UI, so the i18n
 * dictionaries stay out of the lean graph (ADR 0014).
 *
 * Async for API-stability symmetry with {@link createModeler}.
 */
export async function createViewer(
    container: HTMLElement,
    options: ViewerOptions = {},
): Promise<BpmnViewer> {
    const viewer = new BpmnViewer(container, options);
    await viewer.init();

    // Always engage theming so the per-instance `data-bpmn-theme` attribute is
    // set from the first frame; `"automatic"` then follows `prefers-color-scheme`.
    viewer.setTheme(options.theme ?? "automatic");

    return viewer;
}
