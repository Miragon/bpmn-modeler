package io.miragon.intellij.bpmn

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.CustomStatusBarWidget
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.ColorIcon
import java.awt.Color
import java.awt.Cursor
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.Icon
import javax.swing.JComponent

/**
 * Shows one core status slot: the latest view's text, icon and tooltip, and its
 * action on click. The core writes the text; this widget only maps the icon, tone
 * and action onto IntelliJ.
 *
 * A `TextPresentation` cannot render icons, so this is a [CustomStatusBarWidget]
 * backed by a [JBLabel]; [AnimatedIcon.Default] animates on its own inside a
 * visible label. [render] runs on the EDT, so the fields are EDT-confined.
 */
internal class StatusSlotWidget(
    private val widgetId: String,
    private val runAction: (StatusAction) -> Unit,
) : CustomStatusBarWidget {
    private var view: StatusView? = null
    private var label: JBLabel? = null

    override fun ID(): String = widgetId

    override fun getComponent(): JComponent =
        label ?: JBLabel().also {
            it.addMouseListener(
                object : MouseAdapter() {
                    override fun mouseClicked(e: MouseEvent) {
                        view?.action?.let(runAction)
                    }
                },
            )
            label = it
            refresh()
        }

    /** Shows [view], or hides the widget for `null`. */
    fun render(view: StatusView?) {
        this.view = view
        refresh()
    }

    private fun refresh() {
        val label = label ?: return
        val view = view
        label.isVisible = view != null
        label.text = view?.text.orEmpty()
        label.icon = view?.let(::iconFor)
        label.toolTipText = view?.tooltip
        label.cursor = Cursor.getPredefinedCursor(if (view?.action != null) Cursor.HAND_CURSOR else Cursor.DEFAULT_CURSOR)
    }

    override fun dispose() {
        label = null
    }
}

/** Runs a status widget's click: IntelliJ's counterpart of the VS Code command each action names. */
internal fun runStatusAction(project: Project, action: StatusAction) {
    val core = project.getService(CoreProcess::class.java)
    when (action) {
        StatusAction.CHANGE_ENGINE_VERSION -> ChangeEngineVersionAction.changeEngineVersionOfSelectedDiagram(project)
        StatusAction.TOGGLE_LINTING -> core.toggleLinting()
        StatusAction.DEPLOYMENT_MENU -> core.deploymentStatusMenu()
    }
}

private fun iconFor(view: StatusView): Icon? =
    when (view.icon) {
        null -> null
        StatusIcon.LOADING -> AnimatedIcon.Default()
        StatusIcon.CHECK -> AllIcons.General.GreenCheckmark
        StatusIcon.ENGINE -> AllIcons.Webreferences.Server
        StatusIcon.WARNING -> AllIcons.General.Warning
        StatusIcon.SHIELD -> AllIcons.Actions.InlaySecuredShield
        StatusIcon.OFF -> AllIcons.General.InspectionsTrafficOff
        StatusIcon.INFO -> AllIcons.General.Information
        StatusIcon.DOT -> ColorIcon(8, dotColor(view.tone))
    }

// The other icons carry the platform's own colours, so only the dot shows the tone.
private fun dotColor(tone: StatusTone): Color =
    when (tone) {
        StatusTone.NEUTRAL -> JBColor.GRAY
        StatusTone.SUCCESS -> JBColor(0x59A869, 0x499C54)
        StatusTone.ATTENTION -> JBColor(0xD9A343, 0xD9A343)
        StatusTone.INFO -> JBColor(0x3574F0, 0x548AF7)
        StatusTone.WARNING -> JBColor(0xE08855, 0xC77D55)
    }
