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
 * Covers the outbound Tools-menu notifications of [ModelerCommandsRouter] over
 * the real [RpcChannel] transport (a [FakeProcess], per [RouterTestSupport]).
 *
 * The method names are asserted verbatim because they are the contract with
 * `apps/modeler-bridge/src/protocol/descriptor.ts`; the `protocol.json` snapshot
 * keeps the other side honest, and this keeps the Kotlin side from drifting.
 */
@TestApplication
class ModelerCommandsRouterTest {
    private val projectFixture = projectFixture()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    private fun router(): Pair<WiredBridge, ModelerCommandsRouter> {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        return wired to ModelerCommandsRouter(deps)
    }

    @Test
    fun `formatDiagram notifies layout format without an editor id`() {
        val (wired, router) = router()

        router.formatDiagram()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("layout/format", frame.get("method").asString)
        // No editorId on purpose: the core resolves its own active session, so
        // both hosts refuse identically when no diagram has focus.
        assertTrue(
            frame.getAsJsonObject("params").entrySet().isEmpty(),
            "layout/format carries no params",
        )
    }

    @Test
    fun `cleanupDiagram notifies layout cleanup`() {
        val (wired, router) = router()

        router.cleanupDiagram()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("layout/cleanup", frame.get("method").asString)
        assertTrue(
            frame.getAsJsonObject("params").entrySet().isEmpty(),
            "layout/cleanup carries no params",
        )
    }
}
