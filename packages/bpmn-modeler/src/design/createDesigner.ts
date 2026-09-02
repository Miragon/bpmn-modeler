import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import { BpmnDesigner } from "./designer";
import type { DesignerOptions } from "./publicApi";

/**
 * Stands up one independent engine-neutral designer bound to `container` and its
 * own `propertiesPanel.parent`, then engages theming and the locale. Mirrors
 * {@link createModeler} minus the engine-bound setup (element templates,
 * settings) — Design mode has no execution platform — while keeping the i18n
 * merge, because Design mode (unlike the readonly viewer) has translatable UI.
 *
 * Async for API-stability symmetry with {@link createModeler}.
 */
export async function createDesigner(
    container: HTMLElement,
    options: DesignerOptions,
): Promise<BpmnDesigner> {
    // Merge the modeler's internal / dmn-js strings onto the shared library's
    // dictionaries before anything translates. Idempotent, so a second instance
    // (or the bootstrap's own call) re-invoking it is harmless.
    i18n.extend(i18nExtras);

    const designer = new BpmnDesigner(container, options);
    await designer.init();

    // Always engage theming so the per-instance `data-bpmn-theme` attribute is
    // set from the first frame; `"automatic"` then follows `prefers-color-scheme`.
    designer.setTheme(options.theme ?? "automatic");
    // The i18n instance is a page-global singleton, so a locale set here is
    // page-wide; only touch it when the caller is explicit, or a default call
    // would stomp a language the host already set.
    if (options.locale) {
        i18n.setLanguage(options.locale as SupportedLocale);
    }

    return designer;
}
