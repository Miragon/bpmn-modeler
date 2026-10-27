package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project

/**
 * Tools ▸ Change Engine Version — picks a new Camunda engine version for the
 * focused diagram and rewrites its `executionPlatformVersion`. The IntelliJ
 * counterpart of the VS Code `miragon.bpmnModeler.changeEngineVersion` command.
 *
 * The version picker, XML rewrite, re-render, and status-bar update all happen
 * core-side over the bridge; the host only forwards the editor id.
 */
class ChangeEngineVersionAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        changeEngineVersionOfSelectedDiagram(event.project ?: return)
    }

    /** Only meaningful with a BPMN modeler focused. */
    override fun update(event: AnActionEvent) {
        val project = event.project
        event.presentation.isEnabled =
            project != null &&
            FileEditorManager.getInstance(project).selectedEditor is BpmnFileEditor
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    companion object {
        /** Also the engine widget's click, so both ask about the same diagram. */
        fun changeEngineVersionOfSelectedDiagram(project: Project) {
            val editor = FileEditorManager.getInstance(project).selectedEditor as? BpmnFileEditor ?: return
            // Pass the session key explicitly (the file url) rather than relying on the
            // bridge's active-editor pointer, so the right session is targeted.
            project.getService(CoreProcess::class.java).changeEngineVersion(editor.file.url)
        }
    }
}
