package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.IOException

/**
 * Shared "create a new model file and open it" flow behind the New BPMN / New DMN
 * actions. Both prompt for a save target the same way and only differ in the seed
 * bytes, so the save-dialog + VFS-create + open sequence lives here once.
 */
internal object NewModelSupport {
    /**
     * Prompts for a save location, creates the file (seeded with [content], or empty
     * when blank), and opens it. An empty BPMN file is deliberate: the core's
     * `display()` empty branch then drives the engine picker and scaffolds it,
     * keeping the engine list + scaffold XML single-sourced in the core.
     *
     * @param defaultName pre-filled name in the save dialog (extension appended if
     *   the user drops it).
     */
    fun createModelFile(
        event: AnActionEvent,
        dialogTitle: String,
        dialogDescription: String,
        extension: String,
        defaultName: String,
        content: String,
    ) {
        val project = event.project ?: return
        val descriptor = FileSaverDescriptor(dialogTitle, dialogDescription, extension)
        val wrapper =
            FileChooserFactory.getInstance()
                .createSaveFileDialog(descriptor, project)
                .save(defaultDir(event, project), defaultName)
                ?: return // user cancelled the dialog

        val target = wrapper.file
        val name =
            if (target.name.endsWith(".$extension", ignoreCase = true)) target.name
            else "${target.name}.$extension"

        val created =
            WriteCommandAction.writeCommandAction(project).compute<VirtualFile, IOException> {
                val parent =
                    VfsUtil.createDirectoryIfMissing(target.parentFile.path)
                        ?: throw IOException("Could not resolve the target directory: ${target.parentFile.path}")
                val file = parent.findChild(name) ?: parent.createChildData(NewModelSupport, name)
                if (content.isNotEmpty()) file.setBinaryContent(content.toByteArray(Charsets.UTF_8))
                file
            }
        FileEditorManager.getInstance(project).openFile(created, true)
    }

    /**
     * The directory the save dialog opens in: the selected item's folder when
     * invoked from the Project view, else the project root.
     */
    private fun defaultDir(event: AnActionEvent, project: Project): VirtualFile? {
        val context = event.getData(CommonDataKeys.VIRTUAL_FILE) ?: return project.guessProjectDir()
        return if (context.isDirectory) context else context.parent
    }
}
