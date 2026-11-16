package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.junit5.RunInEdt
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ElementXmlDiffContent
import io.miragon.intellij.bpmn.ElementXmlDiffPanel
import io.miragon.intellij.bpmn.ElementXmlDiffSlot
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** The element XML diff inside each diagram diff, routed by the pane the core names. */
@TestApplication
@RunInEdt
class DiffRouterElementXmlDiffTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private class RecordingPanel : ElementXmlDiffPanel {
        var shown: ElementXmlDiffContent? = null

        override fun show(content: ElementXmlDiffContent) {
            shown = content
        }

        override fun hide() {
            shown = null
        }
    }

    private val firstPanel = RecordingPanel()
    private val secondPanel = RecordingPanel()

    /** Two diagram diffs of the same file, each with its own XML diff. */
    private fun twoOpenDiffs(): Pair<WiredBridge, DiffRouter> {
        val wired = wireChannel().also { this.wired = it }
        val router = DiffRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers))
        router.register()
        for ((diffId, panel) in listOf("diff-1" to firstPanel, "diff-2" to secondPanel)) {
            router.openDiff(
                diffId = diffId,
                origin = "scm",
                beforeUri = "$FILE#$diffId-before",
                beforeContent = "<before/>",
                postToBefore = {},
                afterUri = "$FILE#$diffId-after",
                afterContent = "<after/>",
                postToAfter = {},
                elementXmlDiff = ElementXmlDiffSlot(panel, router::elementXmlDiffClosed),
            )
            wired.fake.nextFrame()
        }
        return wired to router
    }

    private fun WiredBridge.dispatchFromCore(method: String, params: Map<String, String>) {
        handlers.dispatch(method, gson.toJsonTree(params).asJsonObject, null)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    private fun shown(diffKey: String, paneUri: String, elementId: String) =
        mapOf(
            "diffKey" to diffKey,
            "paneUri" to paneUri,
            "title" to "$elementId (XML): process.bpmn",
            "before" to """<bpmn:task id="$elementId" />""",
            "after" to """<bpmn:task id="$elementId" name="new" />""",
        )

    private fun content(elementId: String) =
        ElementXmlDiffContent(
            "$elementId (XML): process.bpmn",
            """<bpmn:task id="$elementId" />""",
            """<bpmn:task id="$elementId" name="new" />""",
        )

    @Test
    fun `shows the XML diff inside the diagram diff whose pane the core names`() {
        val (wired, _) = twoOpenDiffs()

        wired.dispatchFromCore("elementXmlDiff/show", shown("element-xml-2", "$FILE#diff-2-before", "Task_1"))

        assertEquals(null, firstPanel.shown)
        assertEquals(content("Task_1"), secondPanel.shown)
    }

    @Test
    fun `moves the XML diff a refresh names`() {
        val (wired, _) = twoOpenDiffs()
        wired.dispatchFromCore("elementXmlDiff/show", shown("element-xml-1", "$FILE#diff-1-before", "Task_1"))

        wired.dispatchFromCore("elementXmlDiff/refresh", shown("element-xml-1", "$FILE#diff-1-before", "Gateway_1"))

        assertEquals(content("Gateway_1"), firstPanel.shown)
    }

    @Test
    fun `closes the XML diff the core closes and leaves the other open`() {
        val (wired, _) = twoOpenDiffs()
        wired.dispatchFromCore("elementXmlDiff/show", shown("element-xml-1", "$FILE#diff-1-before", "Task_1"))
        wired.dispatchFromCore("elementXmlDiff/show", shown("element-xml-2", "$FILE#diff-2-before", "Task_1"))

        wired.dispatchFromCore("elementXmlDiff/close", mapOf("diffKey" to "element-xml-1"))

        assertEquals(null, firstPanel.shown)
        assertEquals(content("Task_1"), secondPanel.shown)
    }

    @Test
    fun `tells the core when the user closes the XML diff`() {
        val (wired, router) = twoOpenDiffs()

        router.elementXmlDiffClosed("element-xml-1")

        val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("elementXmlDiff/closed", frame.get("method").asString)
        assertEquals("element-xml-1", frame.getAsJsonObject("params").get("diffKey").asString)
    }

    @Test
    fun `shows nothing for a diagram diff that is gone`() {
        val (wired, router) = twoOpenDiffs()
        router.disposeDiff("diff-1")
        wired.fake.nextFrame()

        wired.dispatchFromCore("elementXmlDiff/show", shown("element-xml-1", "$FILE#diff-1-before", "Task_1"))

        assertEquals(null, firstPanel.shown)
    }

    private companion object {
        const val FILE = "file:///ws/process.bpmn"
    }
}
