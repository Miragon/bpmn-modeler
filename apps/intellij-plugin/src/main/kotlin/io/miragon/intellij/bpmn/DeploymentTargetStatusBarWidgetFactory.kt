package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

/**
 * Registers the {@link DeploymentTargetStatusBarWidget} per project. Always
 * available; the widget renders empty until the core sends the first
 * `statusBar/showDeploymentTarget` update for a focused BPMN editor.
 */
class DeploymentTargetStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = DeploymentTargetStatusBarWidget.WIDGET_ID

    override fun getDisplayName(): String = "Miragon BPMN Modeler — Deployment Target"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget =
        DeploymentTargetStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) = Disposer.dispose(widget)

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}
