package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Deploy Files… — deploys a multi-select set of workspace BPMN/DMN files
 * to the active deployment target. The IntelliJ counterpart of
 * `bpmn-modeler.deployFiles`. Target resolution, the file picker, and the
 * deployments all happen core-side.
 */
class DeployFilesAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).deployFiles()
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
