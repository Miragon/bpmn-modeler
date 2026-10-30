package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.StatusAction
import io.miragon.intellij.bpmn.StatusIcon
import io.miragon.intellij.bpmn.StatusTone
import io.miragon.intellij.bpmn.StatusView
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * The views of the widget-shaped status methods (`statusBar/showEngineVersion` and
 * its siblings), which the core sends until each slot's callers show their own
 * view. They keep IntelliJ's labels.
 */
internal object LegacyStatusViews {
    val templatesLoading = StatusView(text = "Loading element templates…", icon = StatusIcon.LOADING)

    fun templatesReady(count: Int) = StatusView(text = "$count templates", transient = true)

    fun engineVersion(platform: String?, version: String?): StatusView {
        val label = if (platform == "c7") "Camunda 7" else "Camunda 8"
        return StatusView(
            text = "$label $version",
            tooltip = "Click to change engine version",
            action = StatusAction.CHANGE_ENGINE_VERSION,
        )
    }

    fun deploymentTarget(name: String?, freshness: String, deployedAt: String?, verifiedAt: String?) =
        StatusView(
            text = name ?: "No deployment target",
            icon = StatusIcon.DOT,
            tooltip = tooltipFor(freshness, deployedAt, verifiedAt),
            tone = toneFor(freshness),
            action = StatusAction.DEPLOYMENT_MENU,
        )

    private fun toneFor(freshness: String): StatusTone =
        when (freshness) {
            "deployed" -> StatusTone.SUCCESS
            "changed" -> StatusTone.ATTENTION
            "superseded" -> StatusTone.INFO
            else -> StatusTone.NEUTRAL
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
}
