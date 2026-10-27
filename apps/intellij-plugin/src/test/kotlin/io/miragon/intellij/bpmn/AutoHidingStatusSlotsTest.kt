package io.miragon.intellij.bpmn

import io.miragon.intellij.bpmn.bridge.DeterministicScheduler
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Pins the transient rule VS Code's `VsCodeStatusBar` follows: hide after 3 s unless the slot changes first. */
class AutoHidingStatusSlotsTest {
    private class RecordingStatusSlots : StatusSlots {
        val views = linkedMapOf<StatusSlot, StatusView>()

        override fun show(slot: StatusSlot, view: StatusView) {
            views[slot] = view
        }

        override fun hide(slot: StatusSlot) {
            views.remove(slot)
        }
    }

    private val scheduler = DeterministicScheduler()
    private val shown = RecordingStatusSlots()
    private val slots = AutoHidingStatusSlots(shown, scheduler)

    private val templateCount = StatusView(text = "Element templates (3)", icon = StatusIcon.CHECK, transient = true)
    private val templatesLoading = StatusView(text = "Loading element templates…", icon = StatusIcon.LOADING)

    @Test
    fun `hides a transient view after 3 s`() {
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templateCount)

        assertEquals(mapOf(StatusSlot.ELEMENT_TEMPLATES to templateCount), shown.views)
        assertEquals(listOf(3000L), scheduler.recordedDelays)

        scheduler.runPending()

        assertEquals(emptyMap<StatusSlot, StatusView>(), shown.views)
    }

    @Test
    fun `keeps a view that is not transient`() {
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templatesLoading)
        scheduler.runPending()

        assertEquals(emptyList<Long>(), scheduler.recordedDelays)
        assertEquals(mapOf(StatusSlot.ELEMENT_TEMPLATES to templatesLoading), shown.views)
    }

    @Test
    fun `keeps a later view of the slot when an earlier one would hide itself`() {
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templateCount)
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templatesLoading)

        scheduler.runPending()

        assertEquals(mapOf(StatusSlot.ELEMENT_TEMPLATES to templatesLoading), shown.views)
    }

    @Test
    fun `cancels the pending auto-hide when the slot is hidden`() {
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templateCount)
        slots.hide(StatusSlot.ELEMENT_TEMPLATES)
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templatesLoading)

        scheduler.runPending()

        assertEquals(mapOf(StatusSlot.ELEMENT_TEMPLATES to templatesLoading), shown.views)
    }

    @Test
    fun `hides each slot's transient view on its own timer`() {
        val lintActive = StatusView(text = "BPMNlint", icon = StatusIcon.CHECK, transient = true)
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templateCount)
        slots.show(StatusSlot.BPMNLINT, lintActive)
        slots.show(StatusSlot.ELEMENT_TEMPLATES, templatesLoading)

        scheduler.runPending()

        assertEquals(mapOf(StatusSlot.ELEMENT_TEMPLATES to templatesLoading), shown.views)
    }
}
