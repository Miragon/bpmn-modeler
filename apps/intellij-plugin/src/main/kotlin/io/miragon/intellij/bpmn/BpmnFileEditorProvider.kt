package io.miragon.intellij.bpmn

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Binds the JCEF BPMN editor to `.bpmn` (and `.bpmn20.xml`) files.
 *
 * Placed before the default text editor rather than hiding it, so the
 * round-tripped XML stays reachable on the plain-text tab for inspection and
 * source edits.
 */
class BpmnFileEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean {
        val name = file.name.lowercase()
        return name.endsWith(".bpmn") || name.endsWith(".bpmn20.xml")
    }

    override fun createEditor(project: Project, file: VirtualFile): FileEditor =
        BpmnFileEditor(project, file)

    override fun getEditorTypeId(): String = "bpmn-modeler-editor"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.PLACE_BEFORE_DEFAULT_EDITOR
}
