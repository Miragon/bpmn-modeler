package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Generate IDs from Names: the active diagram opens its review of IDs
 * generated from element names. Always enabled, like Format Diagram: with no
 * BPMN tab focused, the bridge asks the user to focus one.
 */
class GenerateElementIdsAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).generateElementIds()
    }

    companion object {
        const val ID = "io.miragon.bpmn-modeler.generateElementIds"
    }
}
