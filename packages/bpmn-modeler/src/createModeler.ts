import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import type { ModelerOptions } from "./publicApi";
import { BpmnModeler } from "./modeler";
import { destroyOnFailure } from "./destroyOnFailure";

export interface CreateModelerOptions extends ModelerOptions {
    /**
     * @internal Opt in only for single-instance hosts; body-targeted Escape has no instance scope.
     */
    handleGlobalEscape?: boolean;
}

/**
 * Creates an independent modeler in `container` with its own properties panel.
 * Applies the supplied templates, settings, theme, and locale before returning.
 */
export async function createModeler(
    container: HTMLElement,
    options: CreateModelerOptions,
): Promise<BpmnModeler> {
    // Register missing translations before construction can render labels.
    i18n.extend(i18nExtras);

    const modeler = new BpmnModeler(container, options);
    return destroyOnFailure(modeler, async () => {
        await modeler.init();

        if (options.elementTemplates) {
            modeler.setElementTemplates(options.elementTemplates);
        }
        if (options.settings) {
            modeler.setSettings(options.settings);
        }
        // Apply the default on the first frame, even when the caller omitted a theme.
        modeler.setTheme(options.theme ?? "automatic");
        // Locale is page-global; an omitted option must preserve the host's existing language.
        if (options.locale) {
            i18n.setLanguage(options.locale as SupportedLocale);
        }
    });
}
