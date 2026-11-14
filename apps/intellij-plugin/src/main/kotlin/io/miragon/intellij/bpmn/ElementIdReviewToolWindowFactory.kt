package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.ContentFactory

/**
 * The Element IDs tool window along the bottom, beside Problems and the
 * terminal. It is there only while a review is open: the core opens it with
 * the first view and closes it when the review is applied or discarded.
 */
class ElementIdReviewToolWindowFactory :
    ToolWindowFactory,
    DumbAware {
    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = STRIPE_TITLE
    }

    override fun shouldBeAvailable(project: Project): Boolean = false

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = ElementIdReviewPanel(project.getService(CoreProcess::class.java).elementIdReviewActions)
        val content = ContentFactory.getInstance().createContent(panel, null, false)
        content.isCloseable = false
        toolWindow.contentManager.addContent(content)
    }

    companion object {
        const val TOOL_WINDOW_ID = "Miragon Element IDs"

        private const val STRIPE_TITLE = "Element IDs"
    }
}

/** Where the core's review shows: a seam, since a headless test cannot show a tool window. */
internal interface ElementIdReviewWindow {
    fun show(view: ElementIdReviewView)

    fun close()
}

/** Shows the review in the Element IDs tool window, and brings the window up when a review opens. */
internal class ToolWindowElementIdReview(
    private val project: Project,
) : ElementIdReviewWindow {
    // EDT-confined.
    private var open = false

    override fun show(view: ElementIdReviewView) =
        onEdt {
            val toolWindow = toolWindow() ?: return@onEdt
            toolWindow.isAvailable = true
            // Creates the contents of a tool window that was never shown.
            val content = toolWindow.contentManager.contents.firstOrNull { it.component is ElementIdReviewPanel } ?: return@onEdt
            (content.component as ElementIdReviewPanel).show(view)
            content.displayName = view.title
            if (!open) toolWindow.show()
            open = true
        }

    override fun close() =
        onEdt {
            open = false
            val toolWindow = toolWindow() ?: return@onEdt
            toolWindow.contentManagerIfCreated?.contents?.forEach { (it.component as? ElementIdReviewPanel)?.clear() }
            toolWindow.hide()
            toolWindow.isAvailable = false
        }

    private fun toolWindow(): ToolWindow? = ToolWindowManager.getInstance(project).getToolWindow(ElementIdReviewToolWindowFactory.TOOL_WINDOW_ID)

    private fun onEdt(action: () -> Unit) {
        ApplicationManager.getApplication().invokeLater({ if (!project.isDisposed) action() }, project.disposed)
    }
}
