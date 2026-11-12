package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction

class ChangeModelerLanguageAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        event.project?.service<CoreProcess>()?.changeLanguage()
    }
}
