import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import { DEFAULT_THEME_MODE } from "@miragon/bpmn-modeler-types";

import { DmnModeler } from "./modeler";
import type { DmnModelerHandle, DmnModelerOptions } from "./publicApi";

/** Stand up one independent DMN modeler bound to the supplied DOM hosts. */
export async function createModeler(
    container: HTMLElement,
    options: DmnModelerOptions,
): Promise<DmnModelerHandle> {
    i18n.extend(i18nExtras);
    const modeler = new DmnModeler(container, options);
    try {
        modeler.setTheme(options.theme ?? DEFAULT_THEME_MODE);
        // Preserve the page-global locale unless explicitly overridden.
        if (options.locale) {
            i18n.setLanguage(options.locale as SupportedLocale);
        }
    } catch (error) {
        try {
            modeler.destroy();
        } catch {
            // A secondary teardown failure must not mask the root cause.
        }
        throw error;
    }
    return modeler;
}
