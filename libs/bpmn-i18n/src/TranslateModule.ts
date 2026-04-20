/**
 * Custom translator for bpmn-js that supports runtime language switching.
 *
 * Exposes a shared singleton {@link i18n} and a didi module that registers
 * the same instance under the `translate` and `customTranslator` services.
 * UI that lives outside the bpmn-js DI container (the diff legend, the
 * resizer toggle, future components) imports {@link i18n} directly and
 * subscribes to {@link CustomTranslator.onChange} to refresh labels when the
 * active language changes.
 */

import { dictionaries, type SupportedLocale } from "./languages";

/** Set of template keys already reported as missing, to avoid log spam. */
const missingKeys = new Set<string>();

/**
 * Translates template strings using the active language dictionary.
 *
 * Registered as a didi service under the `translate` key.  Holds a mutable
 * locale field that can be swapped at runtime via {@link setLanguage} — the
 * next call to {@link translate} will use the new dictionary immediately,
 * and any listener registered via {@link onChange} is notified so UI outside
 * the DI container can re-render its labels.
 */
export class CustomTranslator {
    static $inject: string[] = [];

    private locale: SupportedLocale = "en";

    private dictionary: Record<string, string> = dictionaries["en"];

    private readonly listeners = new Set<() => void>();

    /**
     * Translates a template string using the active language dictionary.
     *
     * Falls back to the original template when no translation is found and
     * replaces `{param}` placeholders with the values from `replacements`.
     *
     * @param template The English source string used as dictionary key.
     * @param replacements Optional parameter map for `{key}` substitution.
     * @returns The translated (or original) string with placeholders resolved.
     */
    translate(template: string, replacements?: Record<string, string>): string {
        if (
            this.locale !== "en" &&
            !this.dictionary[template] &&
            !missingKeys.has(template)
        ) {
            missingKeys.add(template);
            console.log(`Missing translation [${this.locale}]: ${template}`);
        }

        const translation = this.dictionary[template] || template;

        if (!replacements) return translation;

        let result = translation;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replaceAll(`{${key}}`, value);
        }
        return result;
    }

    /**
     * Switches the active language dictionary and notifies subscribers.
     *
     * bpmn-js UI needs a diagram refresh (export → re-import) to re-invoke
     * `translate()` for already-rendered elements; UI registered via
     * {@link onChange} receives the notification directly and can re-render
     * in place.
     *
     * @param locale The locale code to switch to.
     */
    setLanguage(locale: SupportedLocale): void {
        this.locale = locale;
        this.dictionary = dictionaries[locale];
        for (const listener of this.listeners) {
            listener();
        }
    }

    /**
     * Returns the currently active locale code.
     *
     * @returns The active locale.
     */
    getLocale(): SupportedLocale {
        return this.locale;
    }

    /**
     * Registers a listener invoked whenever {@link setLanguage} switches to a
     * different locale.  Intended for UI that lives outside the bpmn-js DI
     * container (diff legend, resizer toggle, …) so it can re-render its
     * translated labels without polling.
     *
     * @param listener Callback fired after the locale has been updated.
     * @returns Unsubscribe function — call to stop receiving notifications.
     */
    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

/**
 * Shared singleton translator used across the webview.
 *
 * The {@link TranslateModule} below registers this same instance as the
 * bpmn-js `customTranslator` / `translate` services, so every caller — bpmn-js
 * internals, the diff legend, the resizer, future UI — reads from one
 * dictionary and reacts to one {@link CustomTranslator.setLanguage} call.
 */
export const i18n = new CustomTranslator();

/**
 * didi module definition that binds the shared {@link i18n} instance as the
 * bpmn-js `customTranslator` service and exposes its `translate` method as
 * the callable `translate` service bpmn-js expects.
 */
export const TranslateModule = {
    __init__: ["customTranslator"],
    customTranslator: ["value", i18n],
    translate: [
        "factory",
        function translateFactory(customTranslator: CustomTranslator) {
            return function translate(
                template: string,
                replacements?: Record<string, string>,
            ): string {
                return customTranslator.translate(template, replacements);
            };
        },
    ],
};

// Make the factory injectable
(TranslateModule.translate as any)[1].$inject = ["customTranslator"];
