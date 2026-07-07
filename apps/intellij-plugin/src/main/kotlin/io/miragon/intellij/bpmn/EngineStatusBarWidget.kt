package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.CustomStatusBarWidget
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.WindowManager
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.components.JBLabel
import javax.swing.JComponent

/**
 * Status-bar widget that surfaces the core's `StatusBarPort`: the active engine
 * version and the element-template count for the focused BPMN editor, plus a
 * loading spinner while templates are being discovered.
 *
 * The core stays the single source of truth — it computes the platform/version
 * from the XML and the template count from the filesystem — and pushes updates
 * over the `statusBar/…` RPC methods. This widget only renders the latest values it was
 * handed. Mirrors the VS Code `VsCodeStatusBar`'s two items, collapsed into one
 * widget because IntelliJ's status bar is denser.
 *
 * A [TextPresentation] cannot render icons, so the spinner forces a
 * [CustomStatusBarWidget] backed by a [JBLabel]: [AnimatedIcon.Default] animates
 * on its own inside a visible label. All mutations arrive on the EDT via the
 * companion's `invokeLater`, so the fields are EDT-confined — no volatiles needed.
 */
class EngineStatusBarWidget(private val project: Project) : CustomStatusBarWidget {
    private var engineLabel: String? = null
    private var templateCount: Int? = null
    private var templatesLoading: Boolean = false

    private var statusBar: StatusBar? = null
    private var label: JBLabel? = null

    override fun ID(): String = WIDGET_ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun getComponent(): JComponent =
        label ?: JBLabel().also {
            it.toolTipText = TOOLTIP
            label = it
            refresh()
        }

    private fun setEngine(label: String?) {
        engineLabel = label
        refresh()
    }

    private fun setTemplateCount(count: Int?) {
        templateCount = count
        // A resolved count (or an explicit clear) always ends the loading state:
        // it is the frame the spinner was waiting for.
        templatesLoading = false
        refresh()
    }

    private fun setTemplatesLoading() {
        templatesLoading = true
        refresh()
    }

    private fun text(): String {
        val parts = ArrayList<String>(2)
        engineLabel?.let { parts.add(it) }
        if (templatesLoading) {
            parts.add("Loading element templates…")
        } else {
            templateCount?.let { parts.add("$it templates") }
        }
        return if (parts.isEmpty()) "" else "BPMN: " + parts.joinToString("  ·  ")
    }

    private fun refresh() {
        val label = label ?: return
        label.text = text()
        label.icon = if (templatesLoading) AnimatedIcon.Default() else null
    }

    override fun dispose() {
        statusBar = null
        label = null
    }

    companion object {
        /** Must match the `<statusBarWidgetFactory id="…">` in plugin.xml. */
        const val WIDGET_ID = "BpmnEngineWidget"

        private const val TOOLTIP =
            "Miragon BPMN modeler — engine version and element-template count"

        /** Sets the engine label (e.g. "Camunda 7 7.20.0"), or clears it, on the EDT. */
        fun updateEngine(project: Project, label: String?) =
            withWidget(project) { it.setEngine(label) }

        /** Sets the element-template count, or clears it, on the EDT. */
        fun updateTemplateCount(project: Project, count: Int?) =
            withWidget(project) { it.setTemplateCount(count) }

        /** Shows the loading spinner until the next count/hide frame arrives, on the EDT. */
        fun showTemplatesLoading(project: Project) =
            withWidget(project) { it.setTemplatesLoading() }

        private fun withWidget(project: Project, mutate: (EngineStatusBarWidget) -> Unit) {
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                val bar = WindowManager.getInstance().getStatusBar(project) ?: return@invokeLater
                (bar.getWidget(WIDGET_ID) as? EngineStatusBarWidget)?.let(mutate)
            }
        }
    }
}
