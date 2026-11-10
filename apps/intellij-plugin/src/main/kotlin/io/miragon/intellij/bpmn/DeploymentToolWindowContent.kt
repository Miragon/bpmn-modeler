package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.ContentFactory

/**
 * The **Deploy** tab: the deployment webview, whose deploy and start-instance
 * flows are the shared TypeScript `DeploymentMessageDispatcher`. The dispatcher
 * reads "the active editor" to pre-fill the form, so the bridge that renders the
 * `.bpmn` editors also serves this tab.
 */
internal object DeploymentToolWindowContent {
    fun addTo(project: Project, toolWindow: ToolWindow) {
        val coreProcess = project.service<CoreProcess>()
        val panel =
            JcefRelayPanel(toolWindow.disposable, service<IdeThemeSignal>()::deploymentApplyJs, coreProcess::forwardDeploymentMessage)
        coreProcess.registerDeploymentWindow(panel::post)
        Disposer.register(toolWindow.disposable) { coreProcess.unregisterDeploymentWindow() }

        val content = ContentFactory.getInstance().createContent(panel.component, "Deploy", false)
        toolWindow.contentManager.addContent(content)
        // The core refreshes the form defaults only while the tab is shown.
        followContentShown(project, toolWindow, content, coreProcess::setDeploymentOpen)

        panel.load(service<WebviewServer>().deploymentUrl())
    }
}
