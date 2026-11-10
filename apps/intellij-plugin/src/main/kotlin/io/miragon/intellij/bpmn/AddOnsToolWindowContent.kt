package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * The **Add-ons** tab: the add-ons view, whose page the core builds from its
 * catalog and answers. Its browser is built the first time the tab is shown,
 * since many users only deploy and each browser costs a renderer.
 */
internal object AddOnsToolWindowContent {
    private val ADD_ONS = Key.create<Boolean>("io.miragon.bpmn-modeler.addOnsContent")

    fun isAddOns(content: Content): Boolean = content.getUserData(ADD_ONS) == true

    fun addTo(project: Project, toolWindow: ToolWindow) {
        val holder = JPanel(BorderLayout())
        val content = ContentFactory.getInstance().createContent(holder, "Add-ons", false)
        content.putUserData(ADD_ONS, true)
        toolWindow.contentManager.addContent(content)

        val coreProcess = project.service<CoreProcess>()
        var page: JcefRelayPanel? = null
        followContentShown(project, toolWindow, content) { shown ->
            val built = page
            if (shown && built == null) {
                val panel =
                    JcefRelayPanel(toolWindow.disposable, service<IdeThemeSignal>()::addOnsApplyJs, coreProcess::forwardAddOnsMessage)
                page = panel
                coreProcess.registerAddOnsWindow(post = panel::post, reload = panel::reload)
                Disposer.register(toolWindow.disposable) { coreProcess.unregisterAddOnsWindow() }
                holder.add(panel.component, BorderLayout.CENTER)
                content.preferredFocusableComponent = panel.component
                coreProcess.setAddOnsOpen(true)
                panel.load(service<WebviewServer>().addOnsUrl())
            } else {
                coreProcess.setAddOnsOpen(shown)
            }
        }
    }
}
