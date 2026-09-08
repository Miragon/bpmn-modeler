import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";

import { DmnModeler } from "./modeler";
import type { DmnModelerHandle, DmnModelerOptions } from "./publicApi";

/** Stand up one independent DMN modeler bound to the supplied DOM hosts. */
export async function createModeler(
    container: HTMLElement,
    options: DmnModelerOptions,
): Promise<DmnModelerHandle> {
    i18n.extend(i18nExtras);
    const modeler = new DmnModeler(container, options);
    // Always engage theming so the per-instance `data-dmn-theme` attribute is set
    // from the first frame; `"automatic"` then follows `prefers-color-scheme`.
    modeler.setTheme(options.theme ?? "automatic");
    // The i18n instance is a page-global singleton, so a locale set here is
    // page-wide; only touch it when the caller is explicit, so a default call
    // would not stomp a language the host already set. Runs before the caller's
    // first `loadDiagram`, so the initial import already renders translated.
    if (options.locale) {
        i18n.setLanguage(options.locale as SupportedLocale);
    }
    return modeler;
}
