import { i18n } from "@miragon/bpmn-modeler-i18n";
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
    return modeler;
}
