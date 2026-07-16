package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Reload Modeler — soft-reloads every open BPMN modeler by re-registering
 * its live session, so freshly copied or edited element templates appear without
 * closing the tab (unsaved diagram edits survive; there is no JCEF hard reload).
 *
 * The fallback for setups where the element-template filesystem watcher never
 * fires — most notably a WSL working tree reached through a Windows symlink, where
 * no inotify event ever reaches the IDE.
 */
class ReloadModelerAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        // getServiceIfCreated: never spawn a bridge just to reload nothing — with no
        // editor open there is no live session to re-register anyway.
        project.getServiceIfCreated(CoreProcess::class.java)?.reloadModeler()
    }

    /** Only meaningful with a modeler focused; a stale template is a per-editor concern. */
    override fun update(event: AnActionEvent) {
        val project = event.project
        event.presentation.isEnabled =
            project != null &&
            FileEditorManager.getInstance(project).selectedEditor is BpmnFileEditor
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}
