package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import java.awt.datatransfer.StringSelection

/**
 * Tools ▸ Copy Diagram as SVG — exports the focused diagram to SVG and copies it
 * onto the system clipboard. The IntelliJ counterpart of the VS Code
 * `miragon.bpmnModeler.copyAsSvg` command.
 *
 * The export round-trips through the webview (`GetDiagramAsSVGCommand`), so the
 * result arrives asynchronously in the callback rather than as a return value.
 */
class CopyDiagramAsSvgAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = FileEditorManager.getInstance(project).selectedEditor as? BpmnFileEditor ?: return
        project.getService(CoreProcess::class.java).requestDiagramSvg(editor.file.url) { svg ->
            ApplicationManager.getApplication().invokeLater {
                CopyPasteManager.getInstance().setContents(StringSelection(svg))
                HostNotifications(project).showInfo("Diagram copied to clipboard as SVG.")
            }
        }
    }

    /** Only meaningful with a BPMN modeler focused. */
    override fun update(event: AnActionEvent) {
        val project = event.project
        event.presentation.isEnabled =
            project != null &&
            FileEditorManager.getInstance(project).selectedEditor is BpmnFileEditor
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
