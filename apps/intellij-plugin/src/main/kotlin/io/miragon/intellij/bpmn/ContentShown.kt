package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener

/**
 * Tells [onChange] whether [content] is shown, its tool window visible and the
 * content selected: now if it is, and on every change until the tool window is
 * disposed. Both pages attach hidden in the core, so a hidden start needs no report.
 */
internal fun followContentShown(
    project: Project,
    toolWindow: ToolWindow,
    content: Content,
    onChange: (Boolean) -> Unit,
) {
    val latch = VisibilityLatch(shown = false, onChange)
    val update = { latch.update(toolWindow.isVisible, content.isSelected) }
    project.messageBus.connect(toolWindow.disposable).subscribe(
        ToolWindowManagerListener.TOPIC,
        object : ToolWindowManagerListener {
            override fun stateChanged(toolWindowManager: ToolWindowManager) = update()
        },
    )
    toolWindow.contentManager.addContentManagerListener(
        object : ContentManagerListener {
            override fun selectionChanged(event: ContentManagerEvent) = update()
        },
    )
    update()
}
