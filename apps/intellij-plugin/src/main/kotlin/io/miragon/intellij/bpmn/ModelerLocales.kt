package io.miragon.intellij.bpmn

/**
 * The locale codes + display labels the modeler UI supports, shared between the
 * Settings combo ([ModelerSettingsConfigurable]) and the Tools ▸ Change Modeler
 * Language picker ([ChangeModelerLanguageAction]) so the two can never drift.
 *
 * Mirrors the `miragon.bpmnModeler.language` setting of `apps/vscode-plugin/package.json`
 * (ModelerLocalesTest), whose contract spec pins it to the shipped language catalogue.
 */
internal object ModelerLocales {
    val LABELS =
        mapOf(
            "de" to "Deutsch",
            "en" to "English",
            "es" to "Español",
            "fr" to "Français",
            "it" to "Italiano",
            "ja" to "日本語",
            "ko" to "한국어",
            "nl-nl" to "Nederlands (Netherlands)",
            "pt-br" to "Português (Brasil)",
            "ru" to "Русский",
            "zh-Hans" to "简体中文",
            "zh-Hant" to "繁体中文",
        )

    val CODES = LABELS.keys.toList()
}
