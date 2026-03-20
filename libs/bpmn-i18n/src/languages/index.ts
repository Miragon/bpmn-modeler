/**
 * Language registry mapping locale codes to display names and lazy dictionary imports.
 *
 * Each entry provides a human-readable label (for QuickPick) and a factory
 * function that returns the merged translation dictionary for that locale.
 */

import de from "./de";
import en from "./en";
import es from "./es";
import fr from "./fr";
import nlNl from "./nl-nl";
import ptBr from "./pt-br";
import ru from "./ru";
import zhHans from "./zh-Hans";
import zhHant from "./zh-Hant";

/** A locale code supported by the i18n module. */
export type SupportedLocale =
    | "de"
    | "en"
    | "es"
    | "fr"
    | "nl-nl"
    | "pt-br"
    | "ru"
    | "zh-Hans"
    | "zh-Hant";

/** Metadata for a single supported language. */
export interface LanguageEntry {
    readonly label: string;
    readonly locale: SupportedLocale;
    readonly dictionary: Record<string, string>;
}

/** All supported languages with display names and dictionaries. */
export const supportedLanguages: readonly LanguageEntry[] = [
    { label: "Deutsch", locale: "de", dictionary: de },
    { label: "English", locale: "en", dictionary: en },
    { label: "Español", locale: "es", dictionary: es },
    { label: "Français", locale: "fr", dictionary: fr },
    { label: "Nederlands (Netherlands)", locale: "nl-nl", dictionary: nlNl },
    { label: "Português (Brasil)", locale: "pt-br", dictionary: ptBr },
    { label: "Русский", locale: "ru", dictionary: ru },
    { label: "简体中文", locale: "zh-Hans", dictionary: zhHans },
    { label: "繁体中文", locale: "zh-Hant", dictionary: zhHant },
] as const;

/** Map from locale code to merged dictionary for fast lookup. */
export const dictionaries: Record<SupportedLocale, Record<string, string>> = {
    de,
    en,
    es,
    fr,
    "nl-nl": nlNl,
    "pt-br": ptBr,
    ru,
    "zh-Hans": zhHans,
    "zh-Hant": zhHant,
};
