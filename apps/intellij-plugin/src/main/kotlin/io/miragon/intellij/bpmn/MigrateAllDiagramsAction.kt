package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Migrate All Diagrams — migrates every `.bpmn` in the workspace to a
 * user-picked engine version. The IntelliJ counterpart of the VS Code
 * `miragon.bpmnModeler.migrateAllDiagrams` command.
 *
 * Not gated on an open editor: it acts on the whole workspace, so it is offered
 * even with no diagram open. The scope/version pickers and bulk write happen
 * core-side; the file scan globs every `.bpmn` with no exclude, so it also walks
 * `node_modules` on large JS repos (acceptable for v1). Closed files are migrated
 * on disk directly, so their changes surface after the next VFS refresh.
 */
class MigrateAllDiagramsAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        // getService (spawn on demand, like AddMarketplaceAction): the user asked to
        // migrate, and the notify buffers until the bridge is up.
        event.project?.getService(CoreProcess::class.java)?.migrateAllDiagrams()
    }
}
