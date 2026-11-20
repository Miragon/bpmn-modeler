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
 * It also exposes {@link supportedModelerLanguages}, the languages the modeler
 * offers.
 */

import { supportedLanguages, type LanguageEntry } from "@miragon/bpmn-modeler-i18n";

import { extras } from "./languages";

export { extras };

/**
 * The shared {@link supportedLanguages} list as is: the overlay covers every
 * locale it ships, which the parity guard keeps true. The static copies in the
 * VS Code manifest, its docs and the IntelliJ plugin are pinned to it by specs.
 */
export const supportedModelerLanguages: readonly LanguageEntry[] = supportedLanguages;
