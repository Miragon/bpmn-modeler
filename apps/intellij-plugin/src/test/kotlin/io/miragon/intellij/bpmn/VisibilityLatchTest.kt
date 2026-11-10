package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class VisibilityLatchTest {
    private val reported = mutableListOf<Boolean>()

    @Test
    fun `reports only a change of the shown state`() {
        val latch = VisibilityLatch(shown = true) { reported += it }

        latch.update(toolWindowVisible = true, contentSelected = true)
        latch.update(toolWindowVisible = false, contentSelected = true)
        latch.update(toolWindowVisible = false, contentSelected = true)
        latch.update(toolWindowVisible = true, contentSelected = true)

        assertEquals(listOf(false, true), reported)
    }

    @Test
    fun `counts a content as shown only while the tool window is visible and the content selected`() {
        val latch = VisibilityLatch(shown = false) { reported += it }

        latch.update(toolWindowVisible = true, contentSelected = false)
        latch.update(toolWindowVisible = false, contentSelected = true)
        latch.update(toolWindowVisible = true, contentSelected = true)
        latch.update(toolWindowVisible = true, contentSelected = false)

        assertEquals(listOf(true, false), reported)
    }
}
