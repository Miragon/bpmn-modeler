/**
 * Custom translator for bpmn-js that supports runtime language switching.
 *
 * Provides a didi-compatible module that replaces the built-in `translate`
 * service with a {@link CustomTranslator} that can swap dictionaries at
 * runtime via {@link CustomTranslator.setLanguage}.
 */

import { dictionaries, type SupportedLocale } from "./languages";

/** Set of template keys already reported as missing, to avoid log spam. */
const missingKeys = new Set<string>();

/**
 * Translates template strings using the active language dictionary.
 *
 * Registered as a didi service under the `translate` key.  Holds a mutable
 * locale field that can be swapped at runtime — the next call to
 * {@link translate} will use the new dictionary immediately.
 */
export class CustomTranslator {
    static $inject: string[] = [];

    private locale: SupportedLocale = "en";

    private dictionary: Record<string, string> = dictionaries["en"];

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
        if (!this.dictionary[template] && !missingKeys.has(template)) {
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
     * Switches the active language dictionary.
     *
     * After calling this method the next invocation of {@link translate} will
     * use the new dictionary.  A diagram refresh (export → re-import) is
     * needed to update already-rendered UI elements.
     *
     * @param locale The locale code to switch to.
     */
    setLanguage(locale: SupportedLocale): void {
        this.locale = locale;
        this.dictionary = dictionaries[locale];
    }

    /**
     * Returns the currently active locale code.
     *
     * @returns The active locale.
     */
    getLocale(): SupportedLocale {
        return this.locale;
    }
}

/**
 * didi module definition that registers {@link CustomTranslator} as the
 * `translate` service.
 *
 * bpmn-js expects `translate` to be a callable function, so we bind
 * the instance method.  The raw instance is also exposed as
 * `customTranslator` so callers can invoke {@link CustomTranslator.setLanguage}.
 */
export const TranslateModule = {
    __init__: ["customTranslator"],
    customTranslator: [
        "type",
        CustomTranslator,
    ],
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
