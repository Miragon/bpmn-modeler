package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Open All Script Tasks in Editor — materialises every inline script task
 * of the active BPMN diagram as an editor tab. Always enabled (mirroring the
 * marketplace actions): the graceful no-op when no BPMN tab is focused lives
 * bridge-side as a balloon hint, matching the VS Code command.
 */
class OpenAllScriptTasksAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).openAllScriptTasks()
    }
}
