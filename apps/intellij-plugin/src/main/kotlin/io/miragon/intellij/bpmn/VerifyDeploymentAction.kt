package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Verify Deployment on Engine — reconciles the focused diagram's ledger
 * row against the active Camunda 7 target. The IntelliJ counterpart of
 * `bpmn-modeler.verifyDeployment`; lookup, reconcile, and notifications all
 * happen core-side.
 */
class VerifyDeploymentAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).verifyDeployment()
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
