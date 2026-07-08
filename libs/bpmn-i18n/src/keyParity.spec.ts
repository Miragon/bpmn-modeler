/**
 * GUARD-I18N-KEY-PARITY
 *
 * Every locale must expose *exactly* the reference (`en`) key set — no missing
 * keys, no extra keys. The runtime English fallback in `TranslateModule`
 * silently masks drift (a missing key renders as untranslated English with no
 * error), so without this guardrail a locale can rot into partial coverage and
 * only surface as an English string in production. `en` is the canonical source
 * locale (README: keys are the English source string), so it is the superset
 * every other locale is measured against.
 */
import { describe, expect, it } from "vitest";

import { dictionaries, type SupportedLocale } from "./languages";

const REFERENCE: SupportedLocale = "en";
const referenceKeys = new Set(Object.keys(dictionaries[REFERENCE]));

describe("i18n key parity", () => {
    const locales = Object.keys(dictionaries) as SupportedLocale[];

    it.each(locales.filter((locale) => locale !== REFERENCE))(
        "%s defines exactly the reference key set",
        (locale) => {
            const keys = new Set(Object.keys(dictionaries[locale]));
            const missing = [...referenceKeys].filter((key) => !keys.has(key));
            // Extra keys mean `en` is incomplete (a translatable string the
            // reference forgot) — that is drift too, so it fails just as hard.
            const extra = [...keys].filter((key) => !referenceKeys.has(key));
            expect({ locale, missing, extra }).toEqual({ locale, missing: [], extra: [] });
        },
    );

    it("reference locale has no empty values", () => {
        for (const [key, value] of Object.entries(dictionaries[REFERENCE])) {
            expect(value, `empty translation for "${key}"`).toBeTruthy();
        }
    });
});
