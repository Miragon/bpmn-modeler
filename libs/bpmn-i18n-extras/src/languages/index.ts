/*
 * Registry of the modeler's local translation overlay, one dictionary per
 * locale. These are the modeler-internal keys the shared
 * @miragon/bpmn-modeler-i18n library does not ship (the C7 strings live in the
 * shared library); the webviews merge them onto the shared dictionaries at
 * startup with i18n.extend(). GENERATED barrel.
 */
import type { SupportedLocale } from "@miragon/bpmn-modeler-i18n";

import de from "./de";
import en from "./en";
import es from "./es";
import fr from "./fr";
import it from "./it";
import ja from "./ja";
import ko from "./ko";
import nlNl from "./nl-nl";
import ptBr from "./pt-br";
import ru from "./ru";
import zhHans from "./zh-Hans";
import zhHant from "./zh-Hant";

export const extras: Partial<Record<SupportedLocale, Record<string, string>>> = {
    "de": de,
    "en": en,
    "es": es,
    "fr": fr,
    "it": it,
    "ja": ja,
    "ko": ko,
    "nl-nl": nlNl,
    "pt-br": ptBr,
    "ru": ru,
    "zh-Hans": zhHans,
    "zh-Hant": zhHant,
};
