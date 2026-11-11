package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonObject
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

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

        store.update { stored -> stored.overriddenBy(case.raw) }

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
    fun `offers and keeps exactly the surface modes the core reads as a default mode`() {
        assertEquals(coreSurfaceModes().sorted(), ModelerSettingsStore.DEFAULT_MODES.sorted())
    }

    @Test
    fun `offers and keeps exactly the colour themes the core reads`() {
        assertEquals(coreColorThemes().sorted(), ModelerSettingsStore.COLOR_THEMES.sorted())
    }

    @Test
    fun `offers and keeps exactly the ID styles the core reads, in its order`() {
        assertEquals(coreElementIdStyles(), ModelerSettingsStore.ELEMENT_ID_STYLES)
    }

    @Test
    fun `the ID style and follow-name choice survive a new store under the shared persisted keys`() {
        store.update { it.copy(elementIdStyle = "typeSuffix", elementIdsFollowName = true) }

        assertEquals("typeSuffix", appProperties.getValue("${NAMESPACE}elementIds.style"))
        assertEquals("true", appProperties.getValue("${NAMESPACE}elementIds.followName"))
        val reread = ModelerSettingsStore().current()
        assertEquals("typeSuffix", reread.elementIdStyle)
        assertEquals(true, reread.elementIdsFollowName)
        val snapshot = store.snapshotMap(projectFixture.get())
        assertEquals("typeSuffix", snapshot["elementIdStyle"])
        assertEquals(true, snapshot["elementIdsFollowName"])
    }

    @Test
    fun `addMarketplace appends once`() {
        store.addMarketplace("https://a")
        store.addMarketplace("https://b")
        store.addMarketplace("https://a")

        assertEquals(listOf("https://a", "https://b"), store.current().marketplaces)
    }

    @Test
    fun `automatic form preview survives a new store and uses the shared persisted key`() {
        store.update { it.copy(formPreviewAutomatic = false) }

        assertEquals("false", appProperties.getValue("${NAMESPACE}formPreview.automatic"))
        assertEquals(false, ModelerSettingsStore().current().formPreviewAutomatic)
        assertEquals(false, store.snapshotMap(projectFixture.get())["formPreviewAutomatic"])

        store.update { it.copy(formPreviewAutomatic = true) }
        assertEquals(true, ModelerSettingsStore().current().formPreviewAutomatic)
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

    @ParameterizedTest
    @MethodSource("writesDuringAnUpdate")
    fun `a write made while an update computes its change survives the update`(write: WriteDuringUpdate) {
        store.addMarketplace(SEEDED_MARKETPLACE)
        val before = store.current()
        val changeStarted = CountDownLatch(1)
        val releaseChange = CountDownLatch(1)
        val updater =
            thread {
                store.update { stored ->
                    changeStarted.countDown()
                    releaseChange.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    stored.copy(language = "de")
                }
            }
        changeStarted.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)

        val writer = thread { write.writeTo(store) }
        // Without the shared lock the write lands inside this window and the update then overwrites it.
        writer.join(RACE_WINDOW_MILLIS)
        releaseChange.countDown()
        updater.join()
        writer.join()

        assertEquals(write.expectedEffect(before.copy(language = "de")), store.current())
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
                "formPreviewAutomatic",
                "elementIdStyle",
                "elementIdsFollowName",
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

    class WriteDuringUpdate(
        val writeTo: (ModelerSettingsStore) -> Unit,
        val expectedEffect: (ModelerSettings) -> ModelerSettings,
    )

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
                "formPreview.automatic",
                "elementIds.style",
                "elementIds.followName",
            ).map { NAMESPACE + it }

        private val GSON = Gson()

        private const val SEEDED_MARKETPLACE = "https://github.com/acme/seeded"
        private const val LATCH_TIMEOUT_SECONDS = 5L
        private const val RACE_WINDOW_MILLIS = 200L

        @JvmStatic
        fun writesDuringAnUpdate(): List<Named<WriteDuringUpdate>> =
            listOf(
                Named.of(
                    "an app-wide marketplace add",
                    WriteDuringUpdate(
                        writeTo = { it.addMarketplace("https://github.com/acme/added") },
                        expectedEffect = { it.copy(marketplaces = it.marketplaces + "https://github.com/acme/added") },
                    ),
                ),
                Named.of(
                    "an app-wide marketplace removal",
                    WriteDuringUpdate(
                        writeTo = { it.removeMarketplaces(listOf(SEEDED_MARKETPLACE)) },
                        expectedEffect = { it.copy(marketplaces = emptyList()) },
                    ),
                ),
                Named.of(
                    "a lint toggle",
                    WriteDuringUpdate(
                        writeTo = { it.setLintingEnabled(false) },
                        expectedEffect = { it.copy(lintingEnabled = false) },
                    ),
                ),
            )

        @JvmStatic
        fun settingsNormalizationCases(): List<Named<SettingsNormalizationCase>> =
            readTypeScriptJson("miragon.settingsNormalizationCases").asJsonObject.getAsJsonArray("cases").map { row ->
                val case = row.asJsonObject
                Named.of(
                    case.get("name").asString,
                    SettingsNormalizationCase(case.getAsJsonObject("raw"), case.getAsJsonObject("normalized")),
                )
            }

        /** The manifest's `miragon.bpmnModeler.*` defaults under their snapshot names. */
        private fun manifestDefaults(): JsonObject {
            val properties =
                readTypeScriptJson("miragon.vscodeManifest").asJsonObject
                    .getAsJsonObject("contributes")
                    .getAsJsonObject("configuration")
                    .getAsJsonObject("properties")
            val snapshotNames = coreSnapshotNames()
            return JsonObject().apply {
                properties.entrySet()
                    .filter { (key, _) -> key.startsWith(NAMESPACE) }
                    .map { (key, property) ->
                        val section = key.removePrefix(NAMESPACE)
                        val name = requireNotNull(snapshotNames[section]) { "the core names no snapshot key for $section" }
                        name to property.asJsonObject.get("default")
                    }
                    .forEach { (name, default) -> add(name, default) }
            }
        }

        /** `SURFACE_MODES` in `surfaceMode.ts`, the modes the core's `normalizeSettings` keeps. */
        private fun coreSurfaceModes(): List<String> =
            readTypeScriptStringArray("miragon.surfaceModes", "SURFACE_MODES")

        /** `COLOR_THEMES` in the types' `settings.ts`, the themes the core's `normalizeSettings` keeps. */
        private fun coreColorThemes(): List<String> =
            readTypeScriptStringArray("miragon.colorThemes", "COLOR_THEMES")

        /** `ELEMENT_ID_STYLES` in the types' `elementIds.ts`, the styles the core's `normalizeSettings` keeps. */
        private fun coreElementIdStyles(): List<String> =
            readTypeScriptStringArray("miragon.elementIdStyles", "ELEMENT_ID_STYLES")

        /** `SETTING_KEY_OF_SNAPSHOT_KEY` in the core's `modelerSettings.ts`, read backwards: `scripting.spin` → `scriptingSpin`. */
        private fun coreSnapshotNames(): Map<String, String> {
            val source = readTypeScriptFile("miragon.modelerSettings")
            val entries =
                requireNotNull(Regex("""const SETTING_KEY_OF_SNAPSHOT_KEY\b[^=]*=\s*\{([^}]*)}""").find(source)) {
                    "modelerSettings.ts declares no SETTING_KEY_OF_SNAPSHOT_KEY object literal"
                }.groupValues[1]
            return Regex("""(\w+):\s*"([^"]+)"""").findAll(entries).associate { it.groupValues[2] to it.groupValues[1] }
        }

        private fun ModelerSettings.overriddenBy(values: JsonObject): ModelerSettings {
            val merged = GSON.toJsonTree(this).asJsonObject
            values.entrySet().forEach { (key, value) ->
                require(merged.has(key)) { "$key is no ModelerSettings field" }
                merged.add(key, value)
            }
            return GSON.fromJson(merged, ModelerSettings::class.java)
        }
    }
}
