package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.openapi.diagnostic.Logger
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes host-originated BPMN diff sessions. A diff has two JCEF browsers and is
 * keyed by `paneUri` (not editor id); [diffPanes] maps each pane's URI to its
 * core→webview sink, and [diffPaneUris] lets [disposeDiff] drop both panes of a
 * diff at once.
 */
internal class DiffRouter(private val deps: BridgeDeps) {
    private val log = Logger.getInstance(DiffRouter::class.java)

    private val diffPanes = ConcurrentHashMap<String, (String) -> Unit>()
    private val diffPaneUris = ConcurrentHashMap<String, List<String>>()

    fun register() {
        deps.handlers.on("diff/postMessage") { params, _ ->
            val paneUri = params.get("paneUri").asString
            val payload = deps.gson.toJson(params.get("message"))
            diffPanes[paneUri]?.invoke(payload)
        }
    }

    /**
     * Starts a host-originated diff session in the core. Both sides are known up
     * front (IntelliJ resolves the diff with HEAD and working-tree contents in
     * hand), so the core arms a fully-paired diff session immediately — no
     * VS Code-style out-of-order pane resolution. `postToBefore`/`postToAfter`
     * sink core→webview messages into each side's JCEF browser; `beforeUri`/
     * `afterUri` are the diff-scoped pane identities the core routes replies by.
     */
    fun openDiff(
        diffId: String,
        origin: String,
        beforeUri: String,
        beforeContent: String,
        postToBefore: (String) -> Unit,
        afterUri: String,
        afterContent: String,
        postToAfter: (String) -> Unit,
    ) {
        diffPanes[beforeUri] = postToBefore
        diffPanes[afterUri] = postToAfter
        diffPaneUris[diffId] = listOf(beforeUri, afterUri)
        // Route the panes, enqueue diff/open, then spawn off the EDT (the queue
        // holds the frame until the writer exists), so opening a diff never blocks.
        deps.channel.notify(
            "diff/open",
            linkedMapOf(
                "diffId" to diffId,
                "origin" to origin,
                "before" to linkedMapOf("uri" to beforeUri, "content" to beforeContent),
                "after" to linkedMapOf("uri" to afterUri, "content" to afterContent),
            ),
        )
        deps.ensureStartedAsync()
    }

    /** Forwards one raw diff-pane webview message (already JSON) to the core. */
    fun forwardDiffMessage(paneUri: String, rawMessage: String) {
        val message =
            try {
                JsonParser.parseString(rawMessage)
            } catch (e: Exception) {
                log.warn("Discarding malformed diff message: $rawMessage", e)
                return
            }
        deps.channel.notify("diff/webviewMessage", linkedMapOf("paneUri" to paneUri, "message" to message))
    }

    /**
     * Tears a diff down: drops both panes' sinks (so a stray late reply can't
     * resurrect a closed pane) and tells the core to retire the session. Called
     * on tab close and, with an immediate re-`openDiff`, on swap.
     */
    fun disposeDiff(diffId: String) {
        diffPaneUris.remove(diffId)?.forEach { diffPanes.remove(it) }
        deps.channel.notify("diff/dispose", linkedMapOf("diffId" to diffId))
    }

    fun clear() {
        diffPanes.clear()
        diffPaneUris.clear()
    }
}
