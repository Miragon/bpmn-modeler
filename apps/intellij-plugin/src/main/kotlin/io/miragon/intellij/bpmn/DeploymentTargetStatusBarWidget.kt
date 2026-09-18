package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.CustomStatusBarWidget
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.WindowManager
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.ColorIcon
import java.awt.Cursor
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import javax.swing.Icon
import javax.swing.JComponent

/**
 * Status-bar widget surfacing the core's `StatusBarPort.showDeploymentTarget`:
 * the active deployment target and a coloured freshness dot while a BPMN editor
 * is focused (green = deployed, yellow = undeployed changes, gray = no local
 * record). Clicking it runs the switch-target command (the IntelliJ counterpart
 * of the clickable VS Code status bar item). The core is the single source of
 * truth for the name and freshness; this widget only renders the latest value.
 */
class DeploymentTargetStatusBarWidget(private val project: Project) : CustomStatusBarWidget {
    private var targetName: String? = null
    private var freshness: String = "unknown"
    private var deployedAt: String? = null
    private var verifiedAt: String? = null
    private var shown: Boolean = false

    private var statusBar: StatusBar? = null
    private var label: JBLabel? = null

    override fun ID(): String = WIDGET_ID

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
    }

    override fun getComponent(): JComponent =
        label ?: JBLabel().also {
            it.cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            it.addMouseListener(
                object : MouseAdapter() {
                    override fun mouseClicked(e: MouseEvent) {
                        project.getService(CoreProcess::class.java).deploymentStatusMenu()
                    }
                },
            )
            label = it
            refresh()
        }

    private fun setTarget(name: String?, freshness: String, deployedAt: String?, verifiedAt: String?) {
        this.targetName = name
        this.freshness = freshness
        this.deployedAt = deployedAt
        this.verifiedAt = verifiedAt
        shown = true
        refresh()
    }

    private fun hide() {
        shown = false
        refresh()
    }

    private fun refresh() {
        val label = label ?: return
        if (!shown) {
            label.text = ""
            label.icon = null
            label.toolTipText = null
            return
        }
        label.text = targetName ?: "No deployment target"
        label.icon = dotFor(freshness)
        label.toolTipText = tooltipFor(freshness, deployedAt, verifiedAt)
    }

    override fun dispose() {
        statusBar = null
        label = null
    }

    companion object {
        /** Must match the `<statusBarWidgetFactory id="…">` in plugin.xml. */
        const val WIDGET_ID = "BpmnDeploymentTargetWidget"

        private val DOT_DEPLOYED = JBColor(0x59A869, 0x499C54)
        private val DOT_CHANGED = JBColor(0xD9A343, 0xD9A343)
        private val DOT_SUPERSEDED = JBColor(0x3574F0, 0x548AF7)
        private val DOT_UNKNOWN = JBColor.GRAY

        /** Renders the active target + freshness dot (null name = "No deployment target"), on the EDT. */
        fun updateTarget(
            project: Project,
            name: String?,
            freshness: String,
            deployedAt: String?,
            verifiedAt: String?,
        ) = withWidget(project) { it.setTarget(name, freshness, deployedAt, verifiedAt) }

        /** Hides the widget (no BPMN editor focused), on the EDT. */
        fun hide(project: Project) = withWidget(project) { it.hide() }

        private fun dotFor(freshness: String): Icon {
            val color =
                when (freshness) {
                    "deployed" -> DOT_DEPLOYED
                    "changed" -> DOT_CHANGED
                    "superseded" -> DOT_SUPERSEDED
                    else -> DOT_UNKNOWN
                }
            return ColorIcon(8, color)
        }

        private fun tooltipFor(freshness: String, deployedAt: String?, verifiedAt: String?): String {
            val whenText = deployedAt?.let { formatDeployedAt(it) }
            val verifiedSuffix = verifiedAt?.let { " — verified ${formatDeployedAt(it)}" } ?: ""
            return when (freshness) {
                "deployed" ->
                    (
                        whenText?.let { "Deployed — last deployed $it" }
                            ?: "Deployed — matches the last deployment"
                    ) + verifiedSuffix
                "changed" ->
                    (
                        whenText?.let { "Undeployed changes — last deployed $it" }
                            ?: "Undeployed changes since the last deployment"
                    ) + verifiedSuffix
                "superseded" ->
                    (
                        whenText?.let { "Deployed version differs from your diagram (deployed $it)" }
                            ?: "Deployed version differs from your diagram"
                    ) + verifiedSuffix
                else -> "Never deployed to this target from this machine — click to switch target"
            }
        }

        private fun formatDeployedAt(iso: String): String =
            runCatching {
                DateTimeFormatter.ofLocalizedDateTime(FormatStyle.SHORT)
                    .withZone(ZoneId.systemDefault())
                    .format(Instant.parse(iso))
            }.getOrElse { iso }

        private fun withWidget(project: Project, mutate: (DeploymentTargetStatusBarWidget) -> Unit) {
            ApplicationManager.getApplication().invokeLater {
                if (project.isDisposed) return@invokeLater
                val bar = WindowManager.getInstance().getStatusBar(project) ?: return@invokeLater
                (bar.getWidget(WIDGET_ID) as? DeploymentTargetStatusBarWidget)?.let(mutate)
            }
        }
    }
}
