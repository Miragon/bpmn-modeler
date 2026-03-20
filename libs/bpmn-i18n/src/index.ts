/**
 * Public API of the bpmn-i18n library.
 *
 * Exports the didi translate module, supported language metadata for
 * QuickPick items in the extension host, and the locale type.
 */

export { TranslateModule, CustomTranslator } from "./TranslateModule";
export { supportedLanguages } from "./languages";
export type { SupportedLocale, LanguageEntry } from "./languages";
