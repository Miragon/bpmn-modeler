package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Covers the [ScriptRouter] Tools-menu notification over the real [RpcChannel] +
 * [RpcHandlerRegistry] transport (a [FakeProcess], per [RouterTestSupport]).
 */
@TestApplication
class ScriptRouterTest {
    private val projectFixture = projectFixture()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    @Test
    fun `openAllScriptTasks emits script openAll with empty params`() {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = ScriptRouter(deps)

        router.openAllScriptTasks()

        val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("script/openAll", frame.get("method").asString)
        // A payload-free notification: the bridge derives the target from its own
        // active-editor pointer, so the params object carries no keys.
        assertTrue(frame.getAsJsonObject("params").entrySet().isEmpty(), "params must be empty")
    }

    @Test
    fun `notifyDidOpenExternal emits script didOpenExternal with the file path`() {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = ScriptRouter(deps)

        // Exercise the extracted notify directly: the adoption decision (skip our
        // own opens / non-tmp-scripting files) is a pure fileOpened branch, but the
        // emitted frame — the core-facing contract — is what a drift here would break.
        router.notifyDidOpenExternal("/ws/.camunda/tmp/scripting/h/Task_1/script-task/Task_1.js")

        val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("script/didOpenExternal", frame.get("method").asString)
        assertEquals(
            "/ws/.camunda/tmp/scripting/h/Task_1/script-task/Task_1.js",
            frame.getAsJsonObject("params").get("filePath").asString,
        )
    }
}
