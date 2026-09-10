package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Clean Up Diagram — removes orphan diagram interchange, dangling flows
 * and other invisible leftovers.
 *
 * Unlike Format, this changes the model, so nothing happens until the user
 * confirms a modal listing the findings.
 */
class CleanupDiagramAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).cleanupDiagram()
    }
}
