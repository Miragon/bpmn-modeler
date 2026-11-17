package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import io.miragon.intellij.bpmn.ElementXmlDiffContent
import io.miragon.intellij.bpmn.ElementXmlDiffSlot
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes host-originated BPMN diff sessions. A diff has two JCEF browsers and is
 * keyed by `paneUri` (not editor id); [diffPanes] maps each pane's URI to its
 * core→webview sink, and [diffPaneUris] lets [disposeDiff] drop both panes of a
 * diff at once. Each diff also has the element XML diff the core shows inside
 * it, found by a pane the core names.
 */
internal class DiffRouter(private val deps: BridgeDeps) {
    private val log = Logger.getInstance(DiffRouter::class.java)

    private val diffPanes = ConcurrentHashMap<String, (String) -> Unit>()
    private val diffPaneUris = ConcurrentHashMap<String, List<String>>()
    private val elementXmlDiffs = ConcurrentHashMap<String, ElementXmlDiffSlot>()

    fun register() {
        deps.handlers.on("diff/postMessage") { params ->
            val paneUri = params.string("paneUri")
            val message = params.element("message")
            RpcAction { diffPanes[paneUri]?.invoke(deps.gson.toJson(message)) }
        }
        deps.handlers.on("elementXmlDiff/show") { params ->
            val paneUri = params.string("paneUri")
            val diffKey = params.string("diffKey")
            val content = elementXmlDiffContent(params)
            RpcAction { onEdt { elementXmlDiffOf(paneUri)?.show(diffKey, content) } }
        }
        deps.handlers.on("elementXmlDiff/refresh") { params ->
            val paneUri = params.string("paneUri")
            val diffKey = params.string("diffKey")
            val content = elementXmlDiffContent(params)
            RpcAction { onEdt { elementXmlDiffOf(paneUri)?.refresh(diffKey, content) } }
        }
        deps.handlers.on("elementXmlDiff/close") { params ->
            val diffKey = params.string("diffKey")
            RpcAction { onEdt { elementXmlDiffs.values.forEach { it.close(diffKey) } } }
        }
    }

    private fun elementXmlDiffContent(params: RpcParams) =
        ElementXmlDiffContent(params.string("title"), params.string("before"), params.string("after"))

    private fun elementXmlDiffOf(paneUri: String): ElementXmlDiffSlot? =
        diffPaneUris.entries.firstOrNull { (_, paneUris) -> paneUri in paneUris }?.let { elementXmlDiffs[it.key] }

    private fun onEdt(work: () -> Unit) = ApplicationManager.getApplication().invokeLater(work)

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
        elementXmlDiff: ElementXmlDiffSlot,
    ) {
        diffPanes[beforeUri] = postToBefore
        diffPanes[afterUri] = postToAfter
        diffPaneUris[diffId] = listOf(beforeUri, afterUri)
        elementXmlDiffs[diffId] = elementXmlDiff
        // Route the panes, enqueue diff/open, then spawn off the EDT (the queue
        // holds the frame until the writer exists), so opening a diff never blocks.
        deps.channel.notify(
            HostToCoreMethod.DIFF_OPEN,
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
        deps.channel.notify(HostToCoreMethod.DIFF_WEBVIEW_MESSAGE, linkedMapOf("paneUri" to paneUri, "message" to message))
    }

    /**
     * Tears a diff down: drops both panes' sinks (so a stray late reply can't
     * resurrect a closed pane) and tells the core to retire the session. Called
     * on tab close and, with an immediate re-`openDiff`, on swap.
     */
    fun disposeDiff(diffId: String) {
        diffPaneUris.remove(diffId)?.forEach { diffPanes.remove(it) }
        elementXmlDiffs.remove(diffId)
        deps.channel.notify(HostToCoreMethod.DIFF_DISPOSE, linkedMapOf("diffId" to diffId))
    }

    /** The user closed the element XML diff [diffKey], so the core follows no selection with it. */
    fun elementXmlDiffClosed(diffKey: String) {
        deps.channel.notify(HostToCoreMethod.ELEMENT_XML_DIFF_CLOSED, linkedMapOf("diffKey" to diffKey))
    }

    fun clear() {
        diffPanes.clear()
        diffPaneUris.clear()
        elementXmlDiffs.clear()
    }
}
