package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class ModelerSettingsStoreTest {
    private val projectFixture = projectFixture()

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
    fun `an untouched store reports the VS Code defaults`() {
        assertEquals(
            ModelerSettings(
                alignToOrigin = false,
                showTransactionBoundaries = true,
                configFolder = ".camunda",
                persistCodeLinkMap = false,
                c8ApiVersion = "v2",
                colorTheme = "automatic",
                defaultMode = "implement",
                favouriteBpmnElements =
                    listOf("bpmn:ServiceTask", "bpmn:UserTask", "bpmn:CallActivity", "bpmn:ExclusiveGateway"),
                language = "en",
                scriptingSpin = true,
                marketplaces = emptyList(),
            ),
            store.current(),
        )
    }

    @Test
    fun `updated settings round-trip`() {
        val customised =
            store.current().copy(
                alignToOrigin = true,
                showTransactionBoundaries = false,
                configFolder = "config",
                persistCodeLinkMap = true,
                c8ApiVersion = "v1",
                colorTheme = "light",
                defaultMode = "view",
                favouriteBpmnElements = listOf("bpmn:UserTask"),
                language = "de",
                scriptingSpin = false,
                marketplaces = listOf("https://github.com/acme/templates"),
            )

        store.update(customised)

        assertEquals(customised, store.current())
    }

    @Test
    fun `values outside the core's accepted set fall back to the defaults`() {
        store.update(store.current().copy(colorTheme = "dark", defaultMode = "edit"))

        assertEquals("automatic", store.current().colorTheme)
        assertEquals("implement", store.current().defaultMode)
    }

    @Test
    fun `stored values outside the core's accepted set are normalised on read`() {
        appProperties.setValue("miragon.bpmnModeler.colorTheme", "dark")
        appProperties.setValue("miragon.bpmnModeler.defaultMode", "edit")

        assertEquals("automatic", store.current().colorTheme)
        assertEquals("implement", store.current().defaultMode)
    }

    @Test
    fun `a blank config folder keeps the default instead of scanning the whole tree`() {
        store.update(store.current().copy(configFolder = "  "))

        assertEquals(".camunda", store.current().configFolder)
    }

    @Test
    fun `favourites are capped at the palette size`() {
        val eightElements = (1..8).map { "bpmn:Task$it" }

        store.update(store.current().copy(favouriteBpmnElements = eightElements))

        assertEquals(eightElements.take(ModelerSettingsStore.MAX_FAVOURITES), store.current().favouriteBpmnElements)
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
                "marketplaces",
            ),
            snapshot.keys.toList(),
        )
        assertEquals(listOf("https://app", "https://project"), snapshot["marketplaces"])
    }

    private companion object {
        const val MARKETPLACES_KEY = "miragon.bpmnModeler.marketplaces"

        val LIST_KEYS = listOf("miragon.bpmnModeler.favouriteBpmnElements", MARKETPLACES_KEY)

        val SCALAR_KEYS =
            listOf(
                "miragon.bpmnModeler.alignToOrigin",
                "miragon.bpmnModeler.showTransactionBoundaries",
                "miragon.bpmnModeler.configFolder",
                "miragon.bpmnModeler.persistCodeLinkMap",
                "miragon.bpmnModeler.c8ApiVersion",
                "miragon.bpmnModeler.colorTheme",
                "miragon.bpmnModeler.defaultMode",
                "miragon.bpmnModeler.language",
                "miragon.bpmnModeler.scripting.spin",
            )
    }
}
