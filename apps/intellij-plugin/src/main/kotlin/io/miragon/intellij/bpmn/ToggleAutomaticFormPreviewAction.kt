package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

class ToggleAutomaticFormPreviewAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        ModelerSettingsStore.getInstance().update { it.copy(formPreviewAutomatic = !it.formPreviewAutomatic) }
        pushSettingsToRunningBridges()
    }
}
