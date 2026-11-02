package io.miragon.intellij.bpmn

import com.intellij.icons.AllIcons
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.ColorIcon
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Cursor
import java.awt.event.MouseEvent

/** Covers how one status widget renders a slot's view and runs its action. */
@TestApplication
class StatusSlotWidgetTest {
    private val actions = mutableListOf<StatusAction>()
    private val widget = StatusSlotWidget("BpmnEngineWidget") { actions += it }
    private val label get() = widget.component as JBLabel

    private fun click() {
        val event = MouseEvent(label, MouseEvent.MOUSE_CLICKED, 0, 0, 1, 1, 1, false)
        label.mouseListeners.forEach { it.mouseClicked(event) }
    }

    @Test
    fun `stays hidden until the core shows its slot`() {
        assertFalse(label.isVisible)
    }

    @Test
    fun `shows the text, icon and tooltip of the view`() {
        widget.render(StatusView(text = "Camunda 7 (7.20)", icon = StatusIcon.ENGINE, tooltip = "Click to change engine version"))

        assertTrue(label.isVisible)
        assertEquals("Camunda 7 (7.20)", label.text)
        assertSame(AllIcons.Webreferences.Server, label.icon)
        assertEquals("Click to change engine version", label.toolTipText)
    }

    @Test
    fun `renders a view shown before the widget had its component`() {
        val early = StatusSlotWidget("BpmnlintWidget") {}
        early.render(StatusView(text = "BPMNlint", icon = StatusIcon.CHECK))

        assertEquals("BPMNlint", (early.component as JBLabel).text)
    }

    @Test
    fun `hides again for a hidden slot`() {
        widget.render(StatusView(text = "dev", icon = StatusIcon.DOT, tooltip = "Deployed"))

        widget.render(null)

        assertFalse(label.isVisible)
        assertNull(label.icon)
        assertNull(label.toolTipText)
    }

    @Test
    fun `spins the loading icon`() {
        widget.render(StatusView(text = "Loading element templates…", icon = StatusIcon.LOADING))

        assertInstanceOf(AnimatedIcon::class.java, label.icon)
    }

    @Test
    fun `colours the dot by the tone`() {
        widget.render(StatusView(text = "dev", icon = StatusIcon.DOT, tone = StatusTone.SUCCESS))
        val success = (label.icon as ColorIcon).iconColor
        widget.render(StatusView(text = "dev", icon = StatusIcon.DOT, tone = StatusTone.ATTENTION))
        val attention = (label.icon as ColorIcon).iconColor

        assertTrue(success != attention, "success and attention share a dot colour")
    }

    @Test
    fun `runs the view's action on click`() {
        widget.render(StatusView(text = "BPMNlint: off", icon = StatusIcon.OFF, action = StatusAction.TOGGLE_LINTING))

        click()

        assertEquals(listOf(StatusAction.TOGGLE_LINTING), actions)
        assertEquals(Cursor.HAND_CURSOR, label.cursor.type)
    }

    @Test
    fun `ignores a click on a view without an action`() {
        widget.render(StatusView(text = "BPMNlint", icon = StatusIcon.CHECK))

        click()

        assertEquals(emptyList<StatusAction>(), actions)
        assertEquals(Cursor.DEFAULT_CURSOR, label.cursor.type)
    }
}
