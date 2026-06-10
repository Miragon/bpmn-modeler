package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.WindowManager
import com.intellij.util.Consumer
import java.awt.Component
import java.awt.event.MouseEvent

/**
 * Status-bar widget that surfaces the core's `StatusBarPort`: the active engine
 * version and the element-template count for the focused BPMN editor.
 *
 * The core stays the single source of truth — it computes the platform/version
 * from the XML and the template count from the filesystem — and pushes updates
 * over the `statusBar/…` RPC methods. This widget only renders the latest values it was
 * handed. Mirrors the VS Code `VsCodeStatusBar`'s two items, collapsed into one
 * widget because IntelliJ's status bar is denser.
 */
class EngineStatusBarWidget(private val project: Project) :
    StatusBarWidget, StatusBarWidget.TextPresentation {
    @Volatile
    private var engineLabel: String? = null

    @Volatile
    private var templateCount: Int? = null

    private var statusBar: StatusBar? = null

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun getText(): String {
        val parts = ArrayList<String>(2)
        engineLabel?.let { parts.add(it) }
        templateCount?.let { parts.add("$it templates") }
        return if (parts.isEmpty()) "" else "BPMN: " + parts.joinToString("  ·  ")
    }

    override fun getAlignment(): Float = Component.LEFT_ALIGNMENT

    override fun getTooltipText(): String =
        "Miragon BPMN modeler — engine version and element-template count"

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    private fun setEngine(label: String?) {
        engineLabel = label
        refresh()
    }

    private fun setTemplateCount(count: Int?) {
        templateCount = count
        refresh()
    }

    private fun refresh() {
        statusBar?.updateWidget(WIDGET_ID)
    }

    override fun dispose() {
        statusBar = null
    }

    companion object {
        /** Must match the `<statusBarWidgetFactory id="…">` in plugin.xml. */
        const val WIDGET_ID = "BpmnEngineWidget"

        /** Sets the engine label (e.g. "Camunda 7 7.20.0"), or clears it, on the EDT. */
        fun updateEngine(project: Project, label: String?) =
            withWidget(project) { it.setEngine(label) }

        /** Sets the element-template count, or clears it, on the EDT. */
        fun updateTemplateCount(project: Project, count: Int?) =
            withWidget(project) { it.setTemplateCount(count) }

        private fun withWidget(project: Project, mutate: (EngineStatusBarWidget) -> Unit) {
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                val bar = WindowManager.getInstance().getStatusBar(project) ?: return@invokeLater
                (bar.getWidget(WIDGET_ID) as? EngineStatusBarWidget)?.let(mutate)
            }
        }
    }
}
