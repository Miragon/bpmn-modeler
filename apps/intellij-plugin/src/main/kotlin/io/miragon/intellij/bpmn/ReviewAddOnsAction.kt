package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.ui.jcef.JBCefApp

/** Tools ▸ Miragon BPMN Modeler and Find Action: opens the Add-ons tab, then the core lands it on what needs review. */
class ReviewAddOnsAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        reviewAfterReveal({ onDone -> revealAddOns(project, onDone) }) { project.service<CoreProcess>().reviewAddOns() }
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible = event.project != null && JBCefApp.isSupported()
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    companion object {
        const val ID = "io.miragon.bpmn-modeler.reviewAddOns"
    }
}

/** The core is asked only once the tab shows; where it cannot show, nothing is asked. */
internal fun reviewAfterReveal(
    reveal: ((Boolean) -> Unit) -> Unit,
    review: () -> Unit,
) = reveal { shown -> if (shown) review() }
