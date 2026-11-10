package io.miragon.intellij.bpmn

/** The IDE theme as the shared brand mode rule names it, high contrast kept apart from its brightness. */
internal enum class HostColorThemeKind(val wire: String) {
    LIGHT("light"),
    DARK("dark"),
    HIGH_CONTRAST("highContrast"),
    HIGH_CONTRAST_LIGHT("highContrastLight"),
    ;

    companion object {
        fun of(wire: String): HostColorThemeKind = entries.first { it.wire == wire }

        fun of(isDark: Boolean, isHighContrast: Boolean): HostColorThemeKind =
            when {
                isHighContrast -> if (isDark) HIGH_CONTRAST else HIGH_CONTRAST_LIGHT
                isDark -> DARK
                else -> LIGHT
            }
    }
}

/**
 * The Miragon brand mode the add-ons page shows, as `<html>` attributes the
 * brand tokens switch on. Kotlin copy of `brandModeOf` and
 * `brandModeAttributes` in `libs/shared`; `brandMode.cases.json` pins both.
 * Every value is a constant, so the attributes and the script need no escaping.
 */
internal data class BrandMode(val theme: String, val contrast: String?) {
    fun htmlAttributes(): String = " $THEME_ATTRIBUTE=\"$theme\"" + (contrast?.let { " $CONTRAST_ATTRIBUTE=\"$it\"" } ?: "")

    /** Sets both attributes in one script, clearing the contrast when the IDE left high contrast. */
    fun applyJs(): String =
        buildString {
            append("(function(){var r=document.documentElement;")
            append("r.setAttribute('$THEME_ATTRIBUTE','$theme');")
            append(contrast?.let { "r.setAttribute('$CONTRAST_ATTRIBUTE','$it');" } ?: "r.removeAttribute('$CONTRAST_ATTRIBUTE');")
            append("})();")
        }

    companion object {
        private const val THEME_ATTRIBUTE = "data-cd-theme"
        private const val CONTRAST_ATTRIBUTE = "data-cd-kontrast"

        /** A forced light `colorTheme` keeps high contrast, an accessibility need; any other value follows the IDE. */
        fun of(hostThemeKind: HostColorThemeKind, colorTheme: String): BrandMode {
            val contrast = if (hostThemeKind in HIGH_CONTRAST_KINDS) "hoch" else null
            val followsIde = colorTheme != "light"
            val theme = if (followsIde && hostThemeKind in DARK_KINDS) "dark" else "light"
            return BrandMode(theme, contrast)
        }

        private val HIGH_CONTRAST_KINDS = setOf(HostColorThemeKind.HIGH_CONTRAST, HostColorThemeKind.HIGH_CONTRAST_LIGHT)
        private val DARK_KINDS = setOf(HostColorThemeKind.DARK, HostColorThemeKind.HIGH_CONTRAST)
    }
}
