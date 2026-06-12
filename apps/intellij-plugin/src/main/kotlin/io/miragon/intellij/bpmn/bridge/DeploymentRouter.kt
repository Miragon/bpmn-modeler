package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.Logger
import io.miragon.intellij.bpmn.IntellijDeploymentState

/**
 * Routes the deployment tool window: a single core→webview sink (one tool window
 * per project) plus the deployment-state mirror the core's synchronous getters
 * read. The mirror is (re-)seeded on every spawn and on window registration.
 */
internal class DeploymentRouter(private val deps: BridgeDeps) {
    private val log = Logger.getInstance(DeploymentRouter::class.java)

    private val deploymentState by lazy { IntellijDeploymentState.getInstance(deps.project) }

    // The deployment tool window's core→webview sink. One tool window per project,
    // so a later register replaces the previous sink (null when closed).
    @Volatile
    private var deploymentSink: ((String) -> Unit)? = null

    fun register() {
        deps.handlers
            .on("deployment/postMessage") { params, _ ->
                val payload = deps.gson.toJson(params.get("message"))
                deploymentSink?.invoke(payload)
            }
            // PropertiesComponent writes are thread-safe and run on the reader
            // thread here (same as the secretStore handlers).
            .on("deploymentState/saveAuthType") { params, _ ->
                deploymentState.saveAuthType(params.get("authType").asString)
            }
            .on("deploymentState/saveOAuth2Config") { params, _ ->
                deploymentState.saveOAuth2Config(
                    params.get("tokenEndpoint").asString,
                    params.get("audience").asString,
                )
            }
            .on("deploymentState/save") { params, _ ->
                deploymentState.save(
                    params.get("endpoint").asString,
                    params.get("tenantId").asString,
                )
            }
    }

    /**
     * Registers the deployment tool window's core→webview sink and (re-)seeds the
     * deployment-state mirror. One tool window per project, so a later register
     * replaces the previous sink.
     */
    fun registerDeploymentWindow(sink: (String) -> Unit) {
        deploymentSink = sink
        // Seed now if the bridge is already up; otherwise spawn() re-seeds on start.
        // Spawning runs off the EDT so the tool window opens without blocking.
        sendSeed()
        deps.ensureStartedAsync()
    }

    /** Drops the deployment sink and marks the panel closed (stops default refreshes). */
    fun unregisterDeploymentWindow() {
        deploymentSink = null
        deps.channel.notify("deployment/open", linkedMapOf("open" to false))
    }

    /** Forwards one raw deployment-webview message (already JSON) to the core untouched. */
    fun forwardDeploymentMessage(rawMessage: String) {
        val parsed =
            try {
                JsonParser.parseString(rawMessage)
            } catch (e: Exception) {
                log.warn("Discarding malformed deployment message: $rawMessage", e)
                return
            }
        deps.channel.notify("deployment/webviewMessage", linkedMapOf("message" to parsed))
    }

    /** Tells the core whether the deployment panel is visible (drives form-default refresh). */
    fun setDeploymentOpen(open: Boolean) {
        deps.channel.notify("deployment/open", linkedMapOf("open" to open))
    }

    fun sendSeed() {
        if (!deps.isProcessAlive()) return
        deps.channel.notify("deploymentState/seed", linkedMapOf("state" to deploymentState.snapshotMap()))
    }

    fun clear() {
        deploymentSink = null
    }
}
