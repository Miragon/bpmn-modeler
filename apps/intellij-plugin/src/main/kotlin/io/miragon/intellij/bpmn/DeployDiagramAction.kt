package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Deploy Diagram — saves and deploys the active diagram to the active
 * deployment target. The IntelliJ counterpart of `bpmn-modeler.deployDiagram`.
 * Target resolution, the save, and the deployment all happen core-side.
 */
class DeployDiagramAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).deployDiagram()
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
