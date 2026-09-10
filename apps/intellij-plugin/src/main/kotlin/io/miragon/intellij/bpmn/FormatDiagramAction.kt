package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Format Diagram — rearranges the active BPMN diagram left to right and
 * reroutes its connections, touching only diagram interchange.
 *
 * Always enabled, like the other Tools actions: the graceful no-op when no BPMN
 * tab is focused lives bridge-side as a balloon hint, matching the VS Code
 * command. The whole rearrange is one undo step in the editor.
 */
class FormatDiagramAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).formatDiagram()
    }
}
