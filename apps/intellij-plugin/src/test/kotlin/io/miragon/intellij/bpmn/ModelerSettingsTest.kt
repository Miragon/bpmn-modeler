package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Named
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

class ModelerSettingsTest {
    class EditCase(
        val stored: ModelerSettings,
        val loaded: ModelerSettings,
        val edited: ModelerSettings,
        val expected: ModelerSettings,
    )

    @ParameterizedTest
    @MethodSource("editCases")
    fun `applies only what the page changed onto the values stored at write time`(case: EditCase) {
        assertEquals(case.expected, case.stored.withEdits(loaded = case.loaded, edited = case.edited))
    }

    companion object {
        private val LOADED =
            ModelerSettings(
                alignToOrigin = false,
                showTransactionBoundaries = true,
                configFolder = ".camunda",
                persistCodeLinkMap = false,
                c8ApiVersion = "v2",
                colorTheme = "automatic",
                defaultMode = "implement",
                favouriteBpmnElements = listOf("bpmn:ServiceTask"),
                language = "en",
                scriptingSpin = true,
                lintingEnabled = false,
                marketplaces = listOf("https://loaded"),
            )

        private val EVERY_FIELD_CHANGED =
            ModelerSettings(
                alignToOrigin = true,
                showTransactionBoundaries = false,
                configFolder = ".config",
                persistCodeLinkMap = true,
                c8ApiVersion = "v1",
                colorTheme = "light",
                defaultMode = "design",
                favouriteBpmnElements = listOf("bpmn:UserTask"),
                language = "de",
                scriptingSpin = false,
                lintingEnabled = true,
                marketplaces = listOf("https://changed"),
            )

        @JvmStatic
        fun editCases(): List<Named<EditCase>> =
            listOf(
                case(
                    "keeps every value stored meanwhile that the page left alone",
                    stored = EVERY_FIELD_CHANGED,
                    loaded = LOADED,
                    edited = LOADED,
                    expected = EVERY_FIELD_CHANGED,
                ),
                case(
                    "saves every value the page changed",
                    stored = LOADED,
                    loaded = LOADED,
                    edited = EVERY_FIELD_CHANGED,
                    expected = EVERY_FIELD_CHANGED,
                ),
                case(
                    "saves the page's value over one stored meanwhile for the same field",
                    stored = LOADED.copy(language = "fr"),
                    loaded = LOADED,
                    edited = LOADED.copy(language = "de"),
                    expected = LOADED.copy(language = "de"),
                ),
                case(
                    "keeps a lint choice stored meanwhile next to the page's language change",
                    stored = LOADED.copy(lintingEnabled = true),
                    loaded = LOADED,
                    edited = LOADED.copy(language = "de"),
                    expected = LOADED.copy(language = "de", lintingEnabled = true),
                ),
                marketplaceCase(
                    "keeps a marketplace added meanwhile when the page adds another",
                    stored = listOf("https://kept", "https://added-meanwhile"),
                    loaded = listOf("https://kept"),
                    edited = listOf("https://kept", "https://added-on-page"),
                    expected = listOf("https://kept", "https://added-on-page", "https://added-meanwhile"),
                ),
                marketplaceCase(
                    "keeps a marketplace added meanwhile when the page removes another",
                    stored = listOf("https://removed-on-page", "https://added-meanwhile"),
                    loaded = listOf("https://removed-on-page"),
                    edited = emptyList(),
                    expected = listOf("https://added-meanwhile"),
                ),
                marketplaceCase(
                    "keeps a marketplace removed meanwhile out when the page adds another",
                    stored = listOf("https://kept"),
                    loaded = listOf("https://removed-meanwhile", "https://kept"),
                    edited = listOf("https://removed-meanwhile", "https://kept", "https://added-on-page"),
                    expected = listOf("https://kept", "https://added-on-page"),
                ),
                marketplaceCase(
                    "keeps the order the page gave the marketplaces",
                    stored = listOf("https://a", "https://b"),
                    loaded = listOf("https://a", "https://b"),
                    edited = listOf("https://b", "https://a"),
                    expected = listOf("https://b", "https://a"),
                ),
                marketplaceCase(
                    "lists a marketplace added both meanwhile and on the page once",
                    stored = listOf("https://added-twice"),
                    loaded = emptyList(),
                    edited = listOf("https://added-twice"),
                    expected = listOf("https://added-twice"),
                ),
            )

        private fun case(
            name: String,
            stored: ModelerSettings,
            loaded: ModelerSettings,
            edited: ModelerSettings,
            expected: ModelerSettings,
        ): Named<EditCase> = Named.of(name, EditCase(stored, loaded, edited, expected))

        private fun marketplaceCase(
            name: String,
            stored: List<String>,
            loaded: List<String>,
            edited: List<String>,
            expected: List<String>,
        ): Named<EditCase> =
            case(
                name,
                stored = LOADED.copy(marketplaces = stored),
                loaded = LOADED.copy(marketplaces = loaded),
                edited = LOADED.copy(marketplaces = edited),
                expected = LOADED.copy(marketplaces = expected),
            )
    }
}
