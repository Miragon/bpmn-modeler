import Modeler from "bpmn-js/lib/Modeler";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";

import { normalizeMode } from "../kernel/domain/surfaceMode";
import { initOrTeardown } from "../kernel/service/surfaceLifecycle";
import type { CreateModelerOptions } from "../modeler/port/publicApi";
import { createSurface } from "./createSurface";
import { moddlePrefixUnderTwoKeys } from "./moddlePrefixUnderTwoKeys";
import { type BpmnModeler, bpmnModelerOver } from "./presets/bpmnModeler";
import { modelerFeatures } from "./presets/modelerFeatures";

/**
 * Creates an independent modeler in `container` with its own properties panel.
 * Applies the supplied templates, settings, theme, and locale before returning.
 */
export async function createModeler(
    container: HTMLElement,
    options: CreateModelerOptions,
): Promise<BpmnModeler> {
    // Awaited here, so a failed engine chunk rejects with its own error, not the kernel's wrapper.
    const features = await Promise.all(modelerFeatures(container, options));
    // The kernel would keep the later package; plugins rely on moddle's rejection to fall back.
    const prefix = moddlePrefixUnderTwoKeys(features);
    if (prefix !== undefined) {
        throw new Error(`package with prefix <${prefix}> already defined`);
    }
    const surface = await createSurface(container, {
        base: Modeler,
        features,
        mode: normalizeMode(options.mode),
        extraRoots: [options.propertiesPanel.parent],
        theme: options.theme,
        handleGlobalEscape: options.handleGlobalEscape,
        onWarning: options.onWarning,
        onError: options.onError,
        onModeChanged: options.onModeChanged,
    });
    const modeler = await bpmnModelerOver(container, surface, options);
    return initOrTeardown(
        () => modeler,
        (built) => {
            if (options.elementTemplates) {
                built.setElementTemplates(options.elementTemplates);
            }
            if (options.settings) {
                built.setSettings(options.settings);
            }
            // Locale is page-global; an omitted option must preserve the host's existing language.
            if (options.locale) {
                i18n.setLanguage(options.locale as SupportedLocale);
            }
        },
    );
}
