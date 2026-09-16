package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.CustomStatusBarWidget
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.WindowManager
import com.intellij.ui.components.JBLabel
import java.awt.Cursor
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent

/**
 * Status-bar widget surfacing the core's `StatusBarPort.showDeploymentTarget`:
 * the active deployment target while a BPMN editor is focused. Clicking it runs
 * the switch-target command (the IntelliJ counterpart of the clickable VS Code
 * status bar item). The core is the single source of truth for the name; this
 * widget only renders the latest value and forwards the click.
 */
class DeploymentTargetStatusBarWidget(private val project: Project) : CustomStatusBarWidget {
    private var targetName: String? = null
    private var shown: Boolean = false

    private var statusBar: StatusBar? = null
    private var label: JBLabel? = null

    override fun ID(): String = WIDGET_ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun getComponent(): JComponent =
        label ?: JBLabel().also {
            it.toolTipText = TOOLTIP
            it.cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            it.addMouseListener(
                object : MouseAdapter() {
                    override fun mouseClicked(e: MouseEvent) {
                        project.getService(CoreProcess::class.java).switchDeploymentTarget()
                    }
                },
            )
            label = it
            refresh()
        }

    private fun setTarget(name: String?) {
        targetName = name
        shown = true
        refresh()
    }

    private fun hide() {
        shown = false
        refresh()
    }

    private fun refresh() {
        val label = label ?: return
        label.text = if (!shown) "" else targetName?.let { "☁ $it" } ?: "☁ No deployment target"
    }

    override fun dispose() {
        statusBar = null
        label = null
    }

    companion object {
        /** Must match the `<statusBarWidgetFactory id="…">` in plugin.xml. */
        const val WIDGET_ID = "BpmnDeploymentTargetWidget"

        private const val TOOLTIP = "Miragon BPMN modeler — click to switch the active deployment target"

        /** Renders the active target (null = "No deployment target"), on the EDT. */
        fun updateTarget(project: Project, name: String?) =
            withWidget(project) { it.setTarget(name) }

        /** Hides the widget (no BPMN editor focused), on the EDT. */
        fun hide(project: Project) = withWidget(project) { it.hide() }

        private fun withWidget(project: Project, mutate: (DeploymentTargetStatusBarWidget) -> Unit) {
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                val bar = WindowManager.getInstance().getStatusBar(project) ?: return@invokeLater
                (bar.getWidget(WIDGET_ID) as? DeploymentTargetStatusBarWidget)?.let(mutate)
            }
        }
    }
}
