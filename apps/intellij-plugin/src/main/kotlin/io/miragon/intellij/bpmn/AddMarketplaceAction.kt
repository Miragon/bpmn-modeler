package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/** Tools ▸ Add Template Marketplace: the core asks, fetches and registers. */
class AddMarketplaceAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        // getService (not getServiceIfCreated): spawn the bridge on demand — the
        // user explicitly asked to add, and the notify buffers until it is up.
        project.getService(CoreProcess::class.java).addMarketplace()
    }
}
