package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * The **BPMN Modeler** tool window: a **Deploy** tab with the deployment form
 * and an **Add-ons** tab with the add-ons of the project, each a JCEF page
 * the out-of-process core ([CoreProcess]) drives exactly like [BpmnFileEditor]
 * drives the editor, with no protocol logic in Kotlin.
 *
 * One tool window per project (project-level [CoreProcess]). It keeps the id it
 * had as the deployment tool window, so the layout a user saved still applies.
 */
class ModelerToolWindowFactory : ToolWindowFactory {
    override fun init(toolWindow: ToolWindow) {
        toolWindow.setStripeTitle(STRIPE_TITLE)
    }

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        if (!JBCefApp.isSupported()) {
            val label =
                JLabel(
                    "<html><center>JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.</center></html>",
                    SwingConstants.CENTER,
                )
            toolWindow.contentManager.addContent(ContentFactory.getInstance().createContent(label, null, false))
            return
        }
        DeploymentToolWindowContent.addTo(project, toolWindow)
        AddOnsToolWindowContent.addTo(project, toolWindow)
        toolWindow.setTitleActions(listOfNotNull(ActionManager.getInstance().getAction(RefreshAddOnsAction.ID)))
    }

    companion object {
        const val TOOL_WINDOW_ID = "Miragon Deployment"

        private const val STRIPE_TITLE = "BPMN Modeler"
    }
}

/**
 * Opens the BPMN Modeler tool window at its Add-ons tab, on the EDT, and
 * tells [onDone] whether the tab is shown; false where the IDE cannot show it,
 * so the core asks with its list instead.
 */
internal fun revealAddOns(project: Project, onDone: (Boolean) -> Unit) {
    if (project.isDisposed || !JBCefApp.isSupported()) return onDone(false)
    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(ModelerToolWindowFactory.TOOL_WINDOW_ID) ?: return onDone(false)
    // Creates the contents of a tool window that was never shown.
    val contentManager = toolWindow.contentManager
    val addOns = contentManager.contents.firstOrNull(AddOnsToolWindowContent::isAddOns) ?: return onDone(false)
    contentManager.setSelectedContent(addOns, true)
    toolWindow.activate({ onDone(true) }, true)
}

/** Whether this project's BPMN Modeler tool window shows its Add-ons tab; never creates the contents. */
internal fun isAddOnsTabShown(project: Project): Boolean {
    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(ModelerToolWindowFactory.TOOL_WINDOW_ID) ?: return false
    val selected: Content? = toolWindow.takeIf { it.isVisible }?.contentManagerIfCreated?.selectedContent
    return selected != null && AddOnsToolWindowContent.isAddOns(selected)
}
