package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ Update Template Marketplaces — fire-and-forget re-fetch of every
 * configured marketplace. The core swallows per-marketplace errors and folds the
 * outcome into one summary balloon, so this only needs to nudge the bridge.
 */
class UpdateMarketplacesAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        project.getService(CoreProcess::class.java).updateMarketplaces()
    }
}
