package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.nio.file.Files
import java.nio.file.Path

@TestApplication
class ModelerSettingsStoreTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val store get() = ModelerSettingsStore.getInstance()

    private val appProperties get() = PropertiesComponent.getInstance()

    @BeforeEach
    @AfterEach
    fun resetPersistedSettings() {
        SCALAR_KEYS.forEach { appProperties.unsetValue(it) }
        LIST_KEYS.forEach { appProperties.setList(it, null) }
        PropertiesComponent.getInstance(projectFixture.get()).setList(MARKETPLACES_KEY, null)
    }

    @Test
    fun `an untouched store reports the defaults the VS Code manifest declares`() {
        assertEquals(manifestDefaults(), GSON.toJsonTree(store.current()))
    }

    @ParameterizedTest
    @MethodSource("settingsNormalizationCases")
    fun `stores and reads settings as the core normalises them`(case: SettingsNormalizationCase) {
        val defaults = store.current()

        store.update(defaults.overriddenBy(case.raw))

        assertEquals(defaults.overriddenBy(case.normalized), store.current())
    }

    @Test
    fun `stored values outside the core's accepted set are normalised on read`() {
        appProperties.setValue("miragon.bpmnModeler.colorTheme", "dark")
        appProperties.setValue("miragon.bpmnModeler.defaultMode", "edit")

        assertEquals("automatic", store.current().colorTheme)
        assertEquals("implement", store.current().defaultMode)
    }

    @Test
    fun `addMarketplace appends once`() {
        store.addMarketplace("https://a")
        store.addMarketplace("https://b")
        store.addMarketplace("https://a")

        assertEquals(listOf("https://a", "https://b"), store.current().marketplaces)
    }

    @Test
    fun `removeMarketplaces drops only the given locations`() {
        store.addMarketplace("https://a")
        store.addMarketplace("https://b")

        store.removeMarketplaces(listOf("https://a", "https://project-only"))

        assertEquals(listOf("https://b"), store.current().marketplaces)
    }

    @Test
    fun `removing locations the app list never held leaves it unwritten`() {
        store.removeMarketplaces(listOf("https://project-only"))

        assertNull(appProperties.getList(MARKETPLACES_KEY))
    }

    @Test
    fun `the RPC snapshot uses the bridge's keys and the app-project marketplace union`() {
        val project = projectFixture.get()
        store.addMarketplace("https://app")
        ProjectMarketplacesStore.getInstance(project).add("https://project")

        val snapshot = store.snapshotMap(project)

        assertEquals(
            listOf(
                "alignToOrigin",
                "showTransactionBoundaries",
                "configFolder",
                "persistCodeLinkMap",
                "c8ApiVersion",
                "colorTheme",
                "defaultMode",
                "favouriteBpmnElements",
                "language",
                "scriptingSpin",
                "lintingEnabled",
                "marketplaces",
            ),
            snapshot.keys.toList(),
        )
        assertEquals(listOf("https://app", "https://project"), snapshot["marketplaces"])
    }

    @Test
    fun `the RPC snapshot carries the lint choice stored for the user`() {
        appProperties.setValue("${NAMESPACE}linting.enabled", false, true)

        assertEquals(false, store.snapshotMap(projectFixture.get())["lintingEnabled"])
    }

    /** A row of the core's `settingsNormalization.cases.json`; every key left out of `normalized` reads its default. */
    class SettingsNormalizationCase(val raw: JsonObject, val normalized: JsonObject)

    companion object {
        private const val NAMESPACE = "miragon.bpmnModeler."
        private const val MARKETPLACES_KEY = "${NAMESPACE}marketplaces"

        private val LIST_KEYS = listOf("${NAMESPACE}favouriteBpmnElements", MARKETPLACES_KEY)

        private val SCALAR_KEYS =
            listOf(
                "alignToOrigin",
                "showTransactionBoundaries",
                "configFolder",
                "persistCodeLinkMap",
                "c8ApiVersion",
                "colorTheme",
                "defaultMode",
                "language",
                "scripting.spin",
                "linting.enabled",
            ).map { NAMESPACE + it }

        private val GSON = Gson()

        @JvmStatic
        fun settingsNormalizationCases(): List<Named<SettingsNormalizationCase>> =
            readJson("miragon.settingsNormalizationCases").getAsJsonArray("cases").map { row ->
                val case = row.asJsonObject
                Named.of(
                    case.get("name").asString,
                    SettingsNormalizationCase(case.getAsJsonObject("raw"), case.getAsJsonObject("normalized")),
                )
            }

        /** The manifest's `miragon.bpmnModeler.*` defaults under their snapshot names; only VS Code opens the template preview on its own. */
        private fun manifestDefaults(): JsonObject {
            val properties =
                readJson("miragon.vscodeManifest")
                    .getAsJsonObject("contributes")
                    .getAsJsonObject("configuration")
                    .getAsJsonObject("properties")
            return JsonObject().apply {
                properties.entrySet()
                    .filter { (key, _) -> key.startsWith(NAMESPACE) }
                    .map { (key, property) -> snapshotName(key.removePrefix(NAMESPACE)) to property.asJsonObject.get("default") }
                    .filter { (name, _) -> name != "elementTemplatePreviewOpenAutomatically" }
                    .forEach { (name, default) -> add(name, default) }
            }
        }

        /** `scripting.spin` → `scriptingSpin`. */
        private fun snapshotName(section: String): String {
            val segments = section.split(".")
            return segments.first() + segments.drop(1).joinToString("") { segment -> segment.replaceFirstChar { it.uppercaseChar() } }
        }

        private fun ModelerSettings.overriddenBy(values: JsonObject): ModelerSettings {
            val merged = GSON.toJsonTree(this).asJsonObject
            values.entrySet().forEach { (key, value) ->
                require(merged.has(key)) { "$key is no ModelerSettings field" }
                merged.add(key, value)
            }
            return GSON.fromJson(merged, ModelerSettings::class.java)
        }

        private fun readJson(property: String): JsonObject {
            val path = requireNotNull(System.getProperty(property)) { "$property is unset; run the test through Gradle" }
            return JsonParser.parseString(Files.readString(Path.of(path))).asJsonObject
        }
    }
}
