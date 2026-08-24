/**
 * GUARD-I18N-EXTRAS-PARITY
 *
 * The overlay must expose the same key set in every locale — exactly the
 * invariant the shared library holds for its own dictionaries. A key present in
 * one locale but missing from another renders as untranslated English there with
 * no error (the shared translator falls back silently), so without this guard the
 * overlay could rot into partial coverage. `en` is the reference: overlay keys
 * are the English source strings.
 */
import { describe, expect, it } from "vitest";

import type { SupportedLocale } from "@miragon/bpmn-modeler-i18n";

import { extras, supportedModelerLanguages } from "./index";

const REFERENCE: SupportedLocale = "en";
const referenceKeys = new Set(Object.keys(extras[REFERENCE] ?? {}));

describe("i18n extras key parity", () => {
    const locales = Object.keys(extras) as SupportedLocale[];

    it("defines the reference locale", () => {
        expect(referenceKeys.size).toBeGreaterThan(0);
    });

    it.each(locales.filter((locale) => locale !== REFERENCE))(
        "%s defines exactly the reference key set",
        (locale) => {
            const keys = new Set(Object.keys(extras[locale] ?? {}));
            const missing = [...referenceKeys].filter((key) => !keys.has(key));
            const extra = [...keys].filter((key) => !referenceKeys.has(key));
            expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
        },
    );

    it("offers no QuickPick locale without overlay coverage", () => {
        // Every locale the modeler offers must carry the overlay's script-lock
        // strings, or those badges render as English there. `en` is the source
        // locale (always complete); every other offered locale needs an overlay.
        const uncovered = supportedModelerLanguages
            .map((language) => language.locale)
            .filter((locale) => locale !== REFERENCE && extras[locale] === undefined);

        expect(
            uncovered,
            "these offered locales have no overlay dictionary — add src/languages/<locale>.ts or drop them from the picker",
        ).toEqual([]);
    });

    it("has no empty values in any locale", () => {
        for (const locale of locales) {
            for (const [key, value] of Object.entries(extras[locale] ?? {})) {
                expect(value, `empty overlay value for "${key}" in ${locale}`).toBeTruthy();
            }
        }
    });

    it("preserves every {param} placeholder from the reference in each locale", () => {
        const placeholders = (value: string) => (value.match(/{[^}]+}/g) ?? []).sort();
        for (const locale of locales.filter((l) => l !== REFERENCE)) {
            for (const key of referenceKeys) {
                const expected = placeholders(extras[REFERENCE]![key]);
                const actual = placeholders(extras[locale]![key]);
                expect(actual, `placeholder drift for "${key}" in ${locale}`).toEqual(expected);
            }
        }
    });
});
