package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

/**
 * Registers the {@link EngineStatusBarWidget} per project. Always available; the
 * widget simply renders empty until the core sends the first `statusBar/…`
 * update for an open BPMN editor.
 */
class EngineStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = EngineStatusBarWidget.WIDGET_ID

    override fun getDisplayName(): String = "Miranum BPMN Modeler"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = EngineStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) = Disposer.dispose(widget)

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}
