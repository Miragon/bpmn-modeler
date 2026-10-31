package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

@TestApplication
class SettingsRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        PropertiesComponent.getInstance().unsetValue(LINTING_ENABLED_KEY)
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

        wired.handlers.dispatch(
            "settings/setLintingEnabled",
            JsonObject().apply { addProperty("enabled", false) },
            REQUEST_ID,
        )

        assertEquals(listOf<Any?>(false), pushedChoices)
        assertEquals(REQUEST_ID, JsonParser.parseString(wired.fake.nextFrame()).asJsonObject.get("id").asInt)
    }

    private companion object {
        const val REQUEST_ID = 4
        const val LINTING_ENABLED_KEY = "miragon.bpmnModeler.linting.enabled"
    }
}
