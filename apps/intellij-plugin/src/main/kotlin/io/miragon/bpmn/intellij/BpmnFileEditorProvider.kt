package io.miragon.bpmn.intellij

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Registers the BPMN/DMN webview as the default editor for `.bpmn` and
 * `.dmn` files. `HIDE_DEFAULT_EDITOR` replaces IntelliJ's text view so the
 * modeler is the only tab users see.
 */
class BpmnFileEditorProvider : FileEditorProvider, DumbAware {

    override fun accept(project: Project, file: VirtualFile): Boolean {
        val ext = file.extension?.lowercase() ?: return false
        return ext == "bpmn" || ext == "dmn"
    }

    override fun createEditor(project: Project, file: VirtualFile): FileEditor =
        BpmnFileEditor(project, file)

    override fun getEditorTypeId(): String = EDITOR_TYPE_ID

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        const val EDITOR_TYPE_ID: String = "miragon.bpmn.editor"
    }
}
