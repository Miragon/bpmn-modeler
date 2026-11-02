package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

@TestApplication
class SettingsRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        PropertiesComponent.getInstance().unsetValue(LINTING_ENABLED_KEY)
        PropertiesComponent.getInstance().setList(FAVOURITES_KEY, null)
        wired?.dispose()
    }

    @Test
    fun `stores the bridge's lint choice before it pushes the snapshot to every bridge`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        val pushedChoices = mutableListOf<Any?>()
        SettingsRouter(bridgeDeps(project, wired.channel, wired.handlers)) {
            pushedChoices += ModelerSettingsStore.getInstance().snapshotMap(project)["lintingEnabled"]
        }.register()

        wired.handlers.dispatch("settings/setLintingEnabled", lintChoice(false), wired.requestId(REQUEST_ID))

        assertEquals(listOf<Any?>(false), pushedChoices)
        assertEquals(REQUEST_ID, frame(wired.fake.nextFrame()).get("id").asInt)
    }

    @Test
    fun `acks the lint choice only after the snapshot went out`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        SettingsRouter(bridgeDeps(project, wired.channel, wired.handlers)) {
            wired.channel.notify("settings/didChange", linkedMapOf("settings" to emptyMap<String, Any>()))
        }.register()

        wired.handlers.dispatch("settings/setLintingEnabled", lintChoice(false), wired.requestId(REQUEST_ID))

        assertEquals("settings/didChange", frame(wired.fake.nextFrame()).get("method").asString)
        assertEquals(REQUEST_ID, frame(wired.fake.nextFrame()).get("id").asInt)
    }

    @Test
    fun `leaves every other stored setting unwritten`() {
        val wired = wireChannel().also { this.wired = it }
        SettingsRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)) {}.register()

        wired.handlers.dispatch("settings/setLintingEnabled", lintChoice(false), wired.requestId(REQUEST_ID))

        assertNull(PropertiesComponent.getInstance().getList(FAVOURITES_KEY))
    }

    private fun lintChoice(enabled: Boolean) = JsonObject().apply { addProperty("enabled", enabled) }

    private fun frame(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    private companion object {
        const val REQUEST_ID = 4
        const val LINTING_ENABLED_KEY = "miragon.bpmnModeler.linting.enabled"
        const val FAVOURITES_KEY = "miragon.bpmnModeler.favouriteBpmnElements"
    }
}
