package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

/** Runs `brandMode.cases.json`, which `libs/shared` runs against `brandModeOf` and `brandModeAttributes`. */
class BrandModeTest {
    @ParameterizedTest
    @MethodSource("cases")
    fun `picks the brand mode like the TypeScript rule`(case: Case) {
        val mode = BrandMode.of(HostColorThemeKind.of(case.hostThemeKind), case.colorThemeSetting)

        assertEquals(case.theme, mode.theme)
        assertEquals(case.contrast, mode.contrast)
    }

    @ParameterizedTest
    @MethodSource("cases")
    fun `writes the attributes the TypeScript shell writes`(case: Case) {
        val mode = BrandMode.of(HostColorThemeKind.of(case.hostThemeKind), case.colorThemeSetting)

        assertEquals(case.attributes.joinToString("") { (name, value) -> " $name=\"$value\"" }, mode.htmlAttributes())
    }

    @ParameterizedTest
    @MethodSource("cases")
    fun `the live script sets the theme and sets or clears the contrast`(case: Case) {
        val script = BrandMode.of(HostColorThemeKind.of(case.hostThemeKind), case.colorThemeSetting).applyJs()

        assertTrue(script.contains("r.setAttribute('data-cd-theme','${case.theme}');"), script)
        val contrast =
            case.contrast?.let { "r.setAttribute('data-cd-kontrast','$it');" } ?: "r.removeAttribute('data-cd-kontrast');"
        assertTrue(script.contains(contrast), script)
    }

    @Test
    fun `every host theme kind of the TypeScript rule has a Kotlin twin`() {
        val kinds = cases().map { it.payload.hostThemeKind }.toSet()

        assertEquals(kinds, HostColorThemeKind.entries.map { it.wire }.toSet())
    }

    @Test
    fun `an unknown colour theme setting follows the IDE, as the store normalises it`() {
        assertEquals("dark", BrandMode.of(HostColorThemeKind.DARK, "sepia").theme)
    }

    class Case(
        val hostThemeKind: String,
        val colorThemeSetting: String,
        val theme: String,
        val contrast: String?,
        val attributes: List<Pair<String, String>>,
    )

    companion object {
        @JvmStatic
        fun cases(): List<Named<Case>> =
            readTypeScriptJson("miragon.brandModeCases").asJsonObject.getAsJsonArray("cases").map { row ->
                val case = row.asJsonObject
                val mode = case.getAsJsonObject("mode")
                val hostThemeKind = case.get("hostThemeKind").asString
                val colorThemeSetting = case.get("colorThemeSetting").asString
                Named.of(
                    "$hostThemeKind/$colorThemeSetting",
                    Case(
                        hostThemeKind,
                        colorThemeSetting,
                        mode.get("theme").asString,
                        mode.get("contrast")?.asString,
                        case.getAsJsonObject("attributes").entrySet().map { (name, value) -> name to value.asString },
                    ),
                )
            }
    }
}
