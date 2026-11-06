package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/** Tools ▸ Remove Template Marketplace: the core offers the registrations, unregisters and prunes. */
class RemoveMarketplaceAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        // getService (not getServiceIfCreated): the user asked to remove, so spawn
        // the bridge on demand if this window never opened a .bpmn.
        project.getService(CoreProcess::class.java).removeMarketplaces()
    }
}
