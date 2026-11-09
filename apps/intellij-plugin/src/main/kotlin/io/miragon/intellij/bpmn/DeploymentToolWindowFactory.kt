package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * The Camunda 7/8 **Deployment** tool window: a JCEF browser hosting the
 * deployment webview, driven by the out-of-process modeler core ([CoreProcess])
 * exactly like [BpmnFileEditor] drives the editor — verbatim message bridge, no
 * protocol logic in Kotlin. The deploy/start-instance brain is the shared
 * TypeScript `DeploymentMessageDispatcher`; this factory only owns the browser
 * and the two message pipes.
 *
 * One tool window per project (project-level [CoreProcess]); the dispatcher reads
 * "the active editor" to pre-fill the form, so the same bridge that renders the
 * `.bpmn` editors also serves this panel.
 */
class DeploymentToolWindowFactory : ToolWindowFactory {
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
        val coreProcess = project.service<CoreProcess>()
        val themeSignal = service<IdeThemeSignal>()
        val panel = JcefRelayPanel(toolWindow.disposable, themeSignal::deploymentApplyJs, coreProcess::forwardDeploymentMessage)
        coreProcess.registerDeploymentWindow(panel::post)
        Disposer.register(toolWindow.disposable) { coreProcess.unregisterDeploymentWindow() }

        val content = ContentFactory.getInstance().createContent(panel.component, null, false)
        toolWindow.contentManager.addContent(content)
        // The content is created on first reveal, so the panel is open now; the
        // core refreshes the form defaults only while it stays shown.
        coreProcess.setDeploymentOpen(true)
        followContentShown(project, toolWindow, content, shown = true, coreProcess::setDeploymentOpen)

        panel.load(service<WebviewServer>().deploymentUrl())
    }

    companion object {
        const val TOOL_WINDOW_ID = "Miragon Deployment"
    }
}
