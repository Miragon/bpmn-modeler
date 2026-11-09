package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.project.Project
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

@TestApplication
class AddOnsRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

    private fun router(revealArtifacts: (Project, (Boolean) -> Unit) -> Unit = { _, onDone -> onDone(false) }): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        AddOnsRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers), revealArtifacts).register()
        return wired
    }

    @Test
    fun `answers a reveal with whether the Artifacts tab is now shown`() {
        val showing = router { _, onDone -> onDone(true) }
        showing.handlers.dispatch("addOns/reveal", JsonObject(), showing.requestId(3))
        assertEquals(json("""{"id": 3, "result": {"shown": true}}"""), json(showing.fake.nextFrame()))
        showing.dispose()

        val hidden = router { _, onDone -> onDone(false) }
        hidden.handlers.dispatch("addOns/reveal", JsonObject(), hidden.requestId(4))
        assertEquals(json("""{"id": 4, "result": {"shown": false}}"""), json(hidden.fake.nextFrame()))
    }

    @Test
    fun `answers a reveal with an error when the tool window throws`() {
        val wired = router { _, _ -> error("tool window gone") }

        wired.handlers.dispatch("addOns/reveal", JsonObject(), wired.requestId(5))

        assertEquals(json("""{"id": 5, "error": "tool window gone"}"""), json(wired.fake.nextFrame()))
    }
}
