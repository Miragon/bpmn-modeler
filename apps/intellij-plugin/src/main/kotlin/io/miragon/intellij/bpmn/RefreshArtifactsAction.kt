package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * The Artifacts tab's title button, and Find Action's "Refresh Artifacts": the
 * core reads every add-on again, installed packages and stored approvals
 * included, which no file watcher reports.
 */
class RefreshArtifactsAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        // No bridge is started just to read a view nobody opened.
        event.project?.getServiceIfCreated(CoreProcess::class.java)?.refreshAddOns()
    }

    /** The tool window shows its title actions on both tabs, so the button hides on Deploy. */
    override fun update(event: AnActionEvent) {
        val project = event.project
        event.presentation.isEnabledAndVisible =
            project != null && (event.place != ActionPlaces.TOOLWINDOW_TITLE || isArtifactsTabShown(project))
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    companion object {
        const val ID = "io.miragon.bpmn-modeler.refreshArtifacts"
    }
}
