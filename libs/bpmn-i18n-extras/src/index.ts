/**
 * The modeler's local i18n overlay on top of the shared
 * `@miragon/bpmn-modeler-i18n` library.
 *
 * The shared library ships this modeler's Camunda-7 palette / context-pad /
 * properties-panel strings, so this overlay covers only the handful of
 * modeler-internal strings the shared library lacks — the script-lock badge
 * labels the webview emits ({@link extras}). The webviews merge them onto the
 * shared dictionaries at startup via `i18n.extend(extras)`; the shared
 * translations stay authoritative for every key they cover, and nothing
 * regresses to English.
 *
 * It also exposes {@link supportedModelerLanguages}: the shared language
 * catalogue narrowed to the locales the modeler actually has full coverage for.
 */

import { supportedLanguages, type LanguageEntry } from "@miragon/bpmn-modeler-i18n";

import { extras } from "./languages";

export { extras };

/**
 * The language catalogue that drives the extension host's QuickPick. The overlay
 * now translates its handful of script-lock strings for every locale the shared
 * library ships (the C7 strings are upstream), so the modeler adopts the shared
 * {@link supportedLanguages} list wholesale — all twelve locales. The parity
 * guard fails if an offered locale ever loses its overlay coverage.
 */
export const supportedModelerLanguages: readonly LanguageEntry[] = supportedLanguages;
