package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@TestApplication
class DiffRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    private val beforePaneMessages = mutableListOf<String>()
    private val afterPaneMessages = mutableListOf<String>()

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    private fun openedDiffRouter(): Pair<WiredBridge, DiffRouter> {
        val wired = wireChannel().also { this.wired = it }
        val router = DiffRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers))
        router.register()
        router.openDiff(
            diffId = "diff-1",
            origin = "vcs",
            beforeUri = BEFORE_URI,
            beforeContent = "<before/>",
            postToBefore = { beforePaneMessages += it },
            afterUri = AFTER_URI,
            afterContent = "<after/>",
            postToAfter = { afterPaneMessages += it },
        )
        return wired to router
    }

    private fun dispatchPaneMessage(wired: WiredBridge, paneUri: String, type: String) {
        val params = JsonObject()
        params.addProperty("paneUri", paneUri)
        params.add("message", JsonObject().apply { addProperty("type", type) })
        wired.handlers.dispatch("diff/postMessage", params, null)
    }

    @Test
    fun `openDiff sends both sides to the core in one diff open`() {
        val (wired, _) = openedDiffRouter()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("diff/open", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals("diff-1", params.get("diffId").asString)
        assertEquals("vcs", params.get("origin").asString)
        assertEquals(BEFORE_URI, params.getAsJsonObject("before").get("uri").asString)
        assertEquals("<before/>", params.getAsJsonObject("before").get("content").asString)
        assertEquals(AFTER_URI, params.getAsJsonObject("after").get("uri").asString)
        assertEquals("<after/>", params.getAsJsonObject("after").get("content").asString)
    }

    @Test
    fun `core messages reach only the addressed pane`() {
        val (wired, _) = openedDiffRouter()
        wired.fake.nextFrame()

        dispatchPaneMessage(wired, AFTER_URI, "ImportDiagramCommand")

        assertTrue(beforePaneMessages.isEmpty())
        assertEquals(listOf("""{"type":"ImportDiagramCommand"}"""), afterPaneMessages)
    }

    @Test
    fun `webview messages are forwarded to the core under the pane uri`() {
        val (wired, router) = openedDiffRouter()
        wired.fake.nextFrame()

        router.forwardDiffMessage(BEFORE_URI, """{"type":"ReadyQuery"}""")

        val frame = parse(wired.fake.nextFrame())
        assertEquals("diff/webviewMessage", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals(BEFORE_URI, params.get("paneUri").asString)
        assertEquals("ReadyQuery", params.getAsJsonObject("message").get("type").asString)
    }

    @Test
    fun `malformed webview messages are dropped instead of forwarded`() {
        val (wired, router) = openedDiffRouter()
        wired.fake.nextFrame()

        router.forwardDiffMessage(BEFORE_URI, "{not json")

        wired.fake.expectNoFrame()
    }

    @Test
    fun `disposeDiff retires the session and detaches both panes`() {
        val (wired, router) = openedDiffRouter()
        wired.fake.nextFrame()

        router.disposeDiff("diff-1")

        val frame = parse(wired.fake.nextFrame())
        assertEquals("diff/dispose", frame.get("method").asString)
        assertEquals("diff-1", frame.getAsJsonObject("params").get("diffId").asString)

        dispatchPaneMessage(wired, BEFORE_URI, "LateReply")
        dispatchPaneMessage(wired, AFTER_URI, "LateReply")
        assertTrue(beforePaneMessages.isEmpty())
        assertTrue(afterPaneMessages.isEmpty())
    }

    @Test
    fun `clear detaches every pane without telling the core`() {
        val (wired, router) = openedDiffRouter()
        wired.fake.nextFrame()

        router.clear()

        dispatchPaneMessage(wired, BEFORE_URI, "LateReply")
        assertTrue(beforePaneMessages.isEmpty())
        wired.fake.expectNoFrame()
    }

    private companion object {
        const val BEFORE_URI = "file:///ws/process.bpmn#diff-1-before"
        const val AFTER_URI = "file:///ws/process.bpmn#diff-1-after"
    }
}
