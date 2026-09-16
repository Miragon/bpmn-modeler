package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Switch Deployment Target — picks the active deployment target for the
 * project. The IntelliJ counterpart of `bpmn-modeler.switchDeploymentTarget`.
 * The picker, persistence, and status-bar update all happen core-side.
 */
class SwitchDeploymentTargetAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).switchDeploymentTarget()
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
