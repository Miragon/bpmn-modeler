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
 * content selected, from [shown] on, until the tool window is disposed.
 */
internal fun followContentShown(
    project: Project,
    toolWindow: ToolWindow,
    content: Content,
    shown: Boolean,
    onChange: (Boolean) -> Unit,
) {
    val latch = VisibilityLatch(shown, onChange)
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
}
