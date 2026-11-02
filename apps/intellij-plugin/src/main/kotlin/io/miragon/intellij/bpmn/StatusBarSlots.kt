package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.WindowManager

/**
 * The widget that shows each slot. IntelliJ's status bar has no left side, so all
 * four sit on the right, in the order plugin.xml registers them.
 */
internal fun widgetIdFor(slot: StatusSlot): String =
    when (slot) {
        StatusSlot.ELEMENT_TEMPLATES -> "BpmnElementTemplatesWidget"
        StatusSlot.ENGINE_VERSION -> "BpmnEngineWidget"
        StatusSlot.BPMNLINT -> "BpmnlintWidget"
        StatusSlot.DEPLOYMENT_TARGET -> "BpmnDeploymentTargetWidget"
    }

/** Shows each slot in its own [StatusSlotWidget] of the project's status bar. */
internal class StatusBarSlots(private val project: Project) : StatusSlots {
    override fun show(slot: StatusSlot, view: StatusView) = render(slot, view)

    override fun hide(slot: StatusSlot) = render(slot, null)

    private fun render(slot: StatusSlot, view: StatusView?) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            val statusBar = WindowManager.getInstance().getStatusBar(project) ?: return@invokeLater
            (statusBar.getWidget(widgetIdFor(slot)) as? StatusSlotWidget)?.render(view)
        }
    }
}
