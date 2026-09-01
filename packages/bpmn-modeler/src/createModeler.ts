import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras as i18nExtras } from "@miragon/bpmn-modeler-i18n-extras";
import type { ModelerOptions } from "./publicApi";
import { BpmnModeler } from "./modeler";

/**
 * Runtime options accepted by {@link createModeler}: the public
 * {@link ModelerOptions} plus one internal knob (`handleGlobalEscape`), which
 * stays `@internal` and out of `publicApi.ts`.
 */
export interface CreateModelerOptions extends ModelerOptions {
    /**
     * When `true`, an Escape with nothing focused (`<body>`) re-homes this
     * canvas. Default off; the single-instance bootstrap passes `true` for
     * page-wide behaviour, while a multi-instance consumer leaves it off so each
     * modeler only reacts to Escapes inside its own subtrees.
     *
     * @internal Not part of the public API.
     */
    handleGlobalEscape?: boolean;
}

/**
 * Stands up one independent modeler bound to `container` and its own
 * `propertiesPanel.parent`, then applies the initial data-carrying options
 * (element templates, settings, theme, locale) in the order the host expects.
 *
 * Async because {@link BpmnModeler.init} awaits the lazy bpmnlint chunk before
 * constructing bpmn-js.
 */
export async function createModeler(
    container: HTMLElement,
    options: CreateModelerOptions,
): Promise<BpmnModeler> {
    // Merge the modeler's Camunda-7 / dmn-js / internal strings onto the shared
    // library's dictionaries before anything translates. Idempotent, so a second
    // instance (or the bootstrap's own call) re-invoking it is harmless.
    i18n.extend(i18nExtras);

    const modeler = new BpmnModeler(container, options);
    await modeler.init();

    if (options.elementTemplates) {
        modeler.setElementTemplates(options.elementTemplates);
    }
    if (options.settings) {
        modeler.setSettings(options.settings);
    }
    // Always engage theming so the per-instance `data-bpmn-theme` attribute is
    // set from the first frame; `"automatic"` then follows `prefers-color-scheme`.
    modeler.setTheme(options.theme ?? "automatic");
    // The i18n instance is a page-global singleton, so a locale set here is
    // page-wide; only touch it when the caller is explicit, or a default call
    // would stomp a language the host already set. Per-instance locales are a
    // documented 0.1.0 limitation.
    if (options.locale) {
        i18n.setLanguage(options.locale as SupportedLocale);
    }

    return modeler;
}
