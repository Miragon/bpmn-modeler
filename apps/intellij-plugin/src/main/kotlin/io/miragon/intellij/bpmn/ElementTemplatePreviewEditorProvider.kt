package io.miragon.intellij.bpmn

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Opens an element template's JSON with the preview beside it, the way Markdown
 * opens with its own. The split editor holds the IDE's JSON editor, so the plain
 * one is hidden. Built on `TextEditorWithPreview` directly because its provider
 * base class is still experimental API on the 2024.2 floor.
 */
class ElementTemplatePreviewEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean = ElementTemplateFiles.isTemplateFile(file)

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        val jsonEditor = TextEditorProvider.getInstance().createEditor(project, file) as TextEditor
        return TextEditorWithPreview(
            jsonEditor,
            ElementTemplatePreviewEditor(file),
            "Element Template",
            TextEditorWithPreview.Layout.SHOW_EDITOR_AND_PREVIEW,
        )
    }

    override fun getEditorTypeId(): String = "miragon-element-template-preview"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}
