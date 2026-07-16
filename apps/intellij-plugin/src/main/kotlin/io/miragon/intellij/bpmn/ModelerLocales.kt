package io.miragon.intellij.bpmn

/**
 * The locale codes + display labels the modeler UI supports, shared between the
 * Settings combo ([ModelerSettingsConfigurable]) and the Tools ▸ Change Modeler
 * Language picker ([ChangeModelerLanguageAction]) so the two can never drift.
 *
 * Source of truth for the set is `libs/bpmn-i18n/src/languages/index.ts`
 * (`supportedLanguages`): the webview only renders a locale listed there, so any
 * code offered here must also exist in that registry.
 */
internal object ModelerLocales {
    /** Falls back to English, matching the core's default when no language is set. */
    const val DEFAULT_LOCALE = "en"

    val CODES = listOf("de", "en", "es", "fr", "nl-nl", "pt-br", "ru", "zh-Hans", "zh-Hant")

    val LABELS =
        mapOf(
            "de" to "Deutsch",
            "en" to "English",
            "es" to "Español",
            "fr" to "Français",
            "nl-nl" to "Nederlands",
            "pt-br" to "Português (Brasil)",
            "ru" to "Русский",
            "zh-Hans" to "简体中文",
            "zh-Hant" to "繁体中文",
        )
}
