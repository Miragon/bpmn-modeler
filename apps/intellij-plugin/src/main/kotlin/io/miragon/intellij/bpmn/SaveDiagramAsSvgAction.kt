package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile

/**
 * Tools ▸ Save Diagram as SVG — exports the focused diagram to SVG and writes it
 * to a user-chosen file. The IntelliJ counterpart of the VS Code
 * `miragon.bpmnModeler.saveAsSvg` command.
 *
 * The source file is captured up front (before the async round trip) so the save
 * dialog can default to `<name>.svg` next to it even if focus moves while the
 * webview renders the export.
 */
class SaveDiagramAsSvgAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val editor = FileEditorManager.getInstance(project).selectedEditor as? BpmnFileEditor ?: return
        val source = editor.file
        project.getService(CoreProcess::class.java).requestDiagramSvg(source.url) { svg ->
            ApplicationManager.getApplication().invokeLater { saveSvg(project, source, svg) }
        }
    }

    /**
     * Prompts for a target (defaulting to `<name>.svg` beside the source), writes the
     * SVG, and refreshes it into the VFS so it appears in the project tree.
     */
    private fun saveSvg(project: Project, source: VirtualFile, svg: String) {
        if (project.isDisposed) return
        val descriptor = FileSaverDescriptor("Save Diagram as SVG", "", "svg")
        val wrapper =
            FileChooserFactory.getInstance()
                .createSaveFileDialog(descriptor, project)
                .save(source.parent, "${source.nameWithoutExtension}.svg")
                ?: return // user cancelled

        val target = wrapper.file
        target.writeText(svg)
        LocalFileSystem.getInstance().refreshAndFindFileByNioFile(target.toPath())
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
