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
import io.miragon.intellij.bpmn.readTypeScriptCases
import io.miragon.intellij.bpmn.readTypeScriptJson
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

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

    private class OpenDiagramDiffs(
        val wired: WiredBridge,
        val router: DiffRouter,
        val panels: Map<String, RecordingPanel>,
        val slots: Map<String, ElementXmlDiffSlot>,
        val closedByUser: List<String>,
    )

    /** The diagram diffs of the case file, each with its own XML diff. */
    private fun openDiagramDiffs(): OpenDiagramDiffs {
        val wired = wireChannel().also { this.wired = it }
        val router = DiffRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers))
        router.register()
        val panels = linkedMapOf<String, RecordingPanel>()
        val slots = linkedMapOf<String, ElementXmlDiffSlot>()
        val closedByUser = mutableListOf<String>()
        for ((diffId, paneUris) in readTypeScriptJson(CASES).asJsonObject.getAsJsonObject("diagramDiffs").entrySet()) {
            val (beforeUri, afterUri) = paneUris.asJsonArray.map { it.asString }
            val panel = RecordingPanel()
            val slot = ElementXmlDiffSlot(panel) { closedByUser += it }
            router.openDiff(diffId, "scm", beforeUri, "<before/>", {}, afterUri, "<after/>", {}, slot)
            wired.fake.nextFrame()
            panels[diffId] = panel
            slots[diffId] = slot
        }
        return OpenDiagramDiffs(wired, router, panels, slots, closedByUser)
    }

    private fun WiredBridge.dispatchFromCore(method: String, params: JsonObject) {
        handlers.dispatch(method, params, null)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    @ParameterizedTest
    @MethodSource("elementXmlDiffCases")
    fun `shows what the element XML diff loopback shows`(case: JsonObject) {
        val diffs = openDiagramDiffs()

        for (step in case.getAsJsonArray("steps").map { it.asJsonObject }) {
            val frame = step.getAsJsonObject("frame")
            if (frame != null) {
                diffs.wired.dispatchFromCore(frame.get("method").asString, frame.getAsJsonObject("params"))
            } else {
                diffs.slots.getValue(step.get("userCloses").asString).closeByUser()
            }
        }

        val expected =
            case.getAsJsonObject("shown").entrySet().associate { (diffId, shown) ->
                diffId to shown.takeUnless { it.isJsonNull }?.asJsonObject?.let { content ->
                    ElementXmlDiffContent(
                        content.get("title").asString,
                        content.get("before").asString,
                        content.get("after").asString,
                    )
                }
            }
        assertEquals(expected, diffs.panels.mapValues { it.value.shown })
        assertEquals(case.getAsJsonArray("closedByUser").map { it.asString }, diffs.closedByUser)
    }

    @Test
    fun `tells the core when the user closes the XML diff`() {
        val diffs = openDiagramDiffs()

        diffs.router.elementXmlDiffClosed("element-xml-1")

        val frame = gson.fromJson(diffs.wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("elementXmlDiff/closed", frame.get("method").asString)
        assertEquals("element-xml-1", frame.getAsJsonObject("params").get("diffKey").asString)
    }

    @Test
    fun `shows nothing in a diagram diff that was disposed`() {
        val diffs = openDiagramDiffs()
        diffs.router.disposeDiff("d1")
        diffs.wired.fake.nextFrame()

        val shown = JsonObject()
        mapOf(
            "diffKey" to "element-xml-1",
            "paneUri" to "file:///ws/order.bpmn#d1-before",
            "title" to "Task_1 (XML): order.bpmn",
            "before" to "<a/>",
            "after" to "<b/>",
        ).forEach(shown::addProperty)
        diffs.wired.dispatchFromCore("elementXmlDiff/show", shown)

        assertEquals(null, diffs.panels.getValue("d1").shown)
    }

    companion object {
        private const val CASES = "miragon.intellijElementXmlDiffCases"

        /** `intellijElementXmlDiff.cases.json`, which the bridge's element XML diff loopback answers too. */
        @JvmStatic
        fun elementXmlDiffCases(): List<Named<JsonObject>> = readTypeScriptCases(CASES)
    }
}
