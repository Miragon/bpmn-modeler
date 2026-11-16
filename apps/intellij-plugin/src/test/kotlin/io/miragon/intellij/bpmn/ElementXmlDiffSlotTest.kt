package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** The scenarios of the core's `describeElementXmlDiffViewContract`, for the XML diff inside one IntelliJ diagram diff. */
class ElementXmlDiffSlotTest {
    private class RecordingPanel : ElementXmlDiffPanel {
        var shown: ElementXmlDiffContent? = null

        override fun show(content: ElementXmlDiffContent) {
            shown = content
        }

        override fun hide() {
            shown = null
        }
    }

    private val panel = RecordingPanel()
    private val closedByUser = mutableListOf<String>()
    private val slot = ElementXmlDiffSlot(panel) { closedByUser += it }

    private fun content(elementId: String) =
        ElementXmlDiffContent(
            title = "$elementId (XML): order.bpmn",
            before = """<bpmn:task id="$elementId" name="old" />""",
            after = """<bpmn:task id="$elementId" name="new" />""",
        )

    @Test
    fun `shows an element's XML from both sides under its title`() {
        slot.show(ORDER_DIFF, content("Task_1"))

        assertEquals(content("Task_1"), panel.shown)
    }

    @Test
    fun `replaces what it shows on a show or a refresh`() {
        slot.show(ORDER_DIFF, content("Task_1"))

        slot.refresh(ORDER_DIFF, content("Gateway_1"))
        slot.show(ORDER_DIFF, content("Event_1"))

        assertEquals(content("Event_1"), panel.shown)
    }

    @Test
    fun `opens nothing on a refresh while no XML diff is open`() {
        slot.refresh(ORDER_DIFF, content("Task_1"))

        assertEquals(null, panel.shown)
    }

    @Test
    fun `opens nothing on a refresh after the user closed the XML diff`() {
        slot.show(ORDER_DIFF, content("Task_1"))

        slot.closeByUser()
        slot.refresh(ORDER_DIFF, content("Gateway_1"))

        assertEquals(null, panel.shown)
        assertEquals(listOf(ORDER_DIFF), closedByUser)
    }

    @Test
    fun `opens the XML diff again on a show after the user closed it`() {
        slot.show(ORDER_DIFF, content("Task_1"))
        slot.closeByUser()

        slot.show(ORDER_DIFF, content("Gateway_1"))

        assertEquals(content("Gateway_1"), panel.shown)
    }

    @Test
    fun `ignores a refresh and a close of an XML diff it no longer shows`() {
        slot.show(ORDER_DIFF, content("Task_1"))
        slot.show(SWAPPED_DIFF, content("Task_1"))

        slot.refresh(ORDER_DIFF, content("Gateway_1"))
        slot.close(ORDER_DIFF)

        assertEquals(content("Task_1"), panel.shown)
    }

    @Test
    fun `closes the XML diff the core closes`() {
        slot.show(ORDER_DIFF, content("Task_1"))

        slot.close(ORDER_DIFF)

        assertEquals(null, panel.shown)
    }

    @Test
    fun `reports no close by the user for the core's own replacements and close`() {
        slot.show(ORDER_DIFF, content("Task_1"))
        slot.refresh(ORDER_DIFF, content("Gateway_1"))
        slot.show(ORDER_DIFF, content("Event_1"))
        slot.close(ORDER_DIFF)
        slot.closeByUser()

        assertEquals(emptyList<String>(), closedByUser)
    }

    private companion object {
        const val ORDER_DIFF = "element-xml-1"
        const val SWAPPED_DIFF = "element-xml-2"
    }
}
