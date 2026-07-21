package io.miragon.intellij.bpmn

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Binds the JCEF DMN editor to `.dmn` files — the DMN twin of
 * [BpmnFileEditorProvider].
 *
 * Placed before the default text editor rather than hiding it, so the
 * round-tripped XML stays reachable on the plain-text tab for inspection and
 * source edits.
 */
class DmnFileEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean =
        file.name.endsWith(".dmn", ignoreCase = true)

    override fun createEditor(project: Project, file: VirtualFile): FileEditor =
        DmnFileEditor(project, file)

    override fun getEditorTypeId(): String = "dmn-modeler-editor"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.PLACE_BEFORE_DEFAULT_EDITOR
}
