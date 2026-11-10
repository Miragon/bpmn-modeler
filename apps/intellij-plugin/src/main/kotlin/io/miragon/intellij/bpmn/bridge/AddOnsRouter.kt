package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.revealArtifacts

/**
 * Routes the add-ons view of the BPMN Modeler tool window's Artifacts tab: one
 * page per project, whose messages it relays verbatim, and whose visibility it
 * reports with the project root and the settings. The core asks it to show
 * the tab, then delivers the rows to the page itself.
 *
 * The page's messages and the visibility are reliable frames: only a result
 * frees a busy row on the page, so a request lost while the bridge restarts
 * would leave its row busy.
 */
internal class AddOnsRouter(
    private val deps: BridgeDeps,
    // A seam for tests: a headless test cannot show a tool window.
    private val revealArtifacts: (Project, (Boolean) -> Unit) -> Unit = ::revealArtifacts,
) {
    private val log = Logger.getInstance(AddOnsRouter::class.java)

    private class Window(val post: (String) -> Unit, val reload: () -> Unit)

    @Volatile
    private var window: Window? = null

    // Guarded by this, with the frame that sends it: the coalesced queue keeps
    // the last visibility enqueued, which must be the one this field holds.
    private var open = false

    private var spawnedBefore = false

    fun register() {
        deps.handlers
            .on("addOns/postMessage") { params ->
                val message = params.element("message")
                RpcAction { window?.post?.invoke(deps.gson.toJson(message)) }
            }
            .on("addOns/reveal") {
                RpcAction { id ->
                    id?.let { requestId ->
                        deps.channel.replyLaterFromEdt(requestId, "addOns/reveal") { reply ->
                            revealArtifacts(deps.project) { shown -> reply.result(AddOnsRevealResult(shown)) }
                        }
                    }
                }
            }
    }

    /** One page per project, so a later register replaces the previous one. */
    fun registerWindow(post: (String) -> Unit, reload: () -> Unit) {
        window = Window(post, reload)
        deps.ensureStartedAsync()
    }

    /** Closes the view without starting a bridge for it. */
    @Synchronized
    fun unregisterWindow() {
        window = null
        setOpen(false)
    }

    fun forwardMessage(rawMessage: String) {
        val parsed =
            try {
                JsonParser.parseString(rawMessage)
            } catch (e: Exception) {
                log.warn("Discarding a malformed add-ons view message", e)
                return
            }
        deps.channel.notify(HostToCoreMethod.ADD_ONS_WEBVIEW_MESSAGE, linkedMapOf("message" to parsed), reliable = true)
    }

    @Synchronized
    fun setOpen(open: Boolean) {
        this.open = open
        sendVisibility()
    }

    private fun sendVisibility() {
        val params =
            linkedMapOf<String, Any>(
                "open" to open,
                "settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project),
            )
        // Left out, not null, without a project root: the core then shows its no-folder text.
        deps.project.basePath?.let { params["workspaceRoot"] = it }
        deps.channel.notify(HostToCoreMethod.ADD_ONS_OPEN, params, coalesceKey = "addOns/open", reliable = true)
    }

    /**
     * A new process attached its panel hidden; it follows the registered page
     * again. Every process after the first replaced one that died, so the page
     * reloads: only a result frees a busy row, and the dead process took its
     * requests with it.
     */
    fun followNewProcess() {
        val reloadPage =
            synchronized(this) {
                val replacedOne = spawnedBefore
                spawnedBefore = true
                val registered = window ?: return
                sendVisibility()
                registered.reload.takeIf { replacedOne }
            }
        reloadPage?.invoke()
    }

    fun refresh() {
        deps.channel.notify(HostToCoreMethod.ADD_ONS_REFRESH, linkedMapOf<String, Any>())
        deps.ensureStartedAsync()
    }

    fun clear() {
        window = null
    }
}
