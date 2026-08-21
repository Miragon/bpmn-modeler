package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.Computable
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.concurrency.AppExecutorUtil
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.ModelerSettingsStore
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Routes the BPMN-editor feature: open-session registration, document-port
 * fulfilment (`document/write` / `document/save`) against the real IntelliJ
 * `Document`, and core→webview message delivery. Sessions are keyed by editor id
 * so messages reach the right JCEF browser when several `.bpmn` files are open.
 *
 * @param scheduler Debounces external `document/didChange` frames. Injectable so
 *   tests step time deterministically instead of waiting on the shared pool.
 */
internal class EditorSessionRouter(
    private val deps: BridgeDeps,
    private val scheduler: ScheduledExecutorService = AppExecutorUtil.getAppScheduledExecutorService(),
) {
    private val log = Logger.getInstance(EditorSessionRouter::class.java)

    private val sessions = ConcurrentHashMap<String, CoreSession>()

    // Per-editor causation token bridging [handleWrite] to [notifyDocumentChanged]:
    // a `document/write` records its revision here right before mutating the
    // Document, so the synchronous `DocumentListener` echo it triggers can stamp
    // the outgoing `document/didChange` with `causedBy`. The bridge then drops its
    // own write by causation instead of comparing content.
    private val pendingCausation = ConcurrentHashMap<String, Long>()

    // Per-editor debounce timer for *external* edits only (raw-text tab, git
    // checkout, another tool). A newer keystroke cancels and reschedules, so the
    // per-keystroke full-XML round trip + re-render collapses to one send per pause.
    private val debounceTimers = ConcurrentHashMap<String, ScheduledFuture<*>>()

    // Monotonic per-editor change counter. Every change (host write or external)
    // bumps it; a debounced external send captures the value at schedule time and
    // sends only if still current at fire time, so a change that superseded it —
    // crucially a host write, whose echo the bridge drops by causation — never gets
    // re-rendered as a stale external edit. Bumped and read only on the EDT.
    private val changeSeq = ConcurrentHashMap<String, Long>()

    // Per-editor pending SVG-export callback. `GetDiagramAsSVGCommand` round-trips
    // straight through the JS↔JVM webview pipe (no bridge/protocol involvement): the
    // host posts the command, the webview echoes it back with the rendered `svg`,
    // and [forwardWebviewMessage] intercepts that echo and invokes the callback. A
    // newer request replaces the pending one (mirrors VS Code disposing the previous).
    private val pendingSvgRequests = ConcurrentHashMap<String, (String) -> Unit>()

    // Per-editor close-flush latch. Armed by [flushBeforeClose] on the EDT before a
    // tab closes, resolved by [resolveCloseFlush] on the JCEF handler thread when the
    // webview's `DocumentFlushedCommand` lands. Kept off [sessions] because its
    // lifetime is a single ≤250ms close round-trip, not the whole session.
    private val closeFlushLatches = ConcurrentHashMap<String, CloseFlush>()

    // Monotonic token so a late flush reply can't satisfy a newer close request.
    private val closeFlushToken = AtomicLong(0)

    fun register() {
        deps.handlers
            .on("editor/postMessage") { params, _ ->
                val editorId = params.get("editorId").asString
                // `message` is a JSON object; re-serialise it as the postMessage payload.
                val payload = deps.gson.toJson(params.get("message"))
                sessions[editorId]?.postToWebview(payload)
            }
            .on("document/write") { params, id -> handleWrite(params, id) }
            .on("document/save") { params, id -> handleSave(params, id) }
    }

    // ── host → core ────────────────────────────────────────────────────────────

    /** Registers an editor and tells the core to open it (seeding the document mirror). */
    fun registerSession(session: CoreSession) {
        sessions[session.editorId] = session
        // Enqueue the register frame now and spawn off the EDT: the outbound queue
        // buffers it until the writer exists, so editor construction never blocks on
        // the (occasionally seconds-long) process start.
        sendRegister(session)
        deps.ensureStartedAsync()
    }

    private fun sendRegister(session: CoreSession) {
        val content =
            ApplicationManager.getApplication().runReadAction(
                Computable {
                    FileDocumentManager.getInstance().getDocument(session.file)?.text.orEmpty()
                },
            )
        deps.channel.notify(
            "session/register",
            linkedMapOf(
                "editorId" to session.editorId,
                "uriString" to session.editorId,
                "path" to session.file.path,
                "fsPath" to session.file.path,
                "scheme" to "file",
                // Authoritative IntelliJ project root for element-template
                // discovery; falls back to the file's dir for light-edit
                // projects where basePath is null.
                "workspaceRoot" to (deps.project.basePath ?: session.file.parent?.path),
                // Seed the core's SettingsPort before it scans templates, so the
                // very first discovery uses the configured folder, not the default.
                "settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project),
                "content" to content,
            ),
        )
    }

    /**
     * Pushes the current settings snapshot to the running core so an open editor
     * reacts live (language re-render, configFolder template reload). No-ops when
     * no bridge is alive: the snapshot is re-seeded on the next [sendRegister].
     */
    fun pushSettings() {
        if (!deps.isProcessAlive()) return
        deps.channel.notify("settings/didChange", linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project)))
    }

    /**
     * Forwards one raw webview message (already JSON) to the core untouched.
     *
     * Runs on the single [webviewForwardExecutor] thread that also feeds off the CEF
     * query thread, so it must stay cheap: instead of parsing the (full-BPMN-XML)
     * message and re-serialising it into the frame, splice the raw text straight in.
     * The coalesce key is sniffed by substring rather than a parse — the only
     * producer of `SyncDocumentCommand` is the webview shim's compact
     * `JSON.stringify`, so the marker is a stable literal. A leading-`{` guard drops
     * obvious non-objects here; anything subtler that slips through is caught and
     * logged bridge-side (`server.ts`), never crashing the core.
     */
    fun forwardWebviewMessage(editorId: String, rawMessage: String) {
        val trimmed = rawMessage.trimStart()
        if (!trimmed.startsWith("{")) {
            log.warn("Discarding non-JSON webview message: $rawMessage")
            return
        }
        // An SVG-export echo is the host's own round trip, not a core message: if a
        // request is pending for this editor, extract the `svg` and consume it here.
        // Forwarding it on would ship the whole SVG through the RPC pipe for nothing
        // (the core has no handler for it). An echo with no pending callback (e.g. a
        // stale one already replaced) falls through and forwards like any message.
        if (trimmed.contains(SVG_COMMAND_MARKER) && pendingSvgRequests.containsKey(editorId)) {
            val callback = pendingSvgRequests.remove(editorId)
            val svg = runCatching { deps.gson.fromJson(rawMessage, JsonObject::class.java).get("svg") }
                .getOrNull()
                ?.takeIf { !it.isJsonNull }
                ?.asString
            if (callback != null && svg != null) callback(svg)
            return
        }
        // Resolve a close-flush reply (only while a close is in progress for this
        // editor) so the blocked EDT in [flushBeforeClose] can wake and write. The
        // message is still forwarded to the core below, which drops the unknown
        // command as a no-op — the bridge never initiates flushes.
        resolveCloseFlush(editorId, trimmed)
        // Document syncs fire once per diagram edit and supersede each other — only
        // the latest XML matters for write-back — so collapse queued ones.
        val coalesceKey =
            if (trimmed.contains(SYNC_COMMAND_MARKER)) "sync:$editorId" else null
        // Splice the raw message in as the `message` value rather than parse →
        // re-serialise. editorId goes through gson so it is correctly JSON-escaped.
        val frame =
            "{\"method\":\"webview/message\",\"params\":{\"editorId\":" +
                deps.gson.toJson(editorId) +
                ",\"message\":" + rawMessage + "}}"
        deps.channel.notifyRaw(frame, coalesceKey)
    }

    /**
     * Forwards a document change to the core so external edits (git revert/
     * checkout, the plain-text tab, another tool) re-render the diagram. The host
     * stays dumb otherwise, but it does tag the echo of its own `document/write`:
     * if [handleWrite] left a pending causation token for this editor, the change
     * carries it as `causedBy` so the bridge can drop its own write by explicit
     * causation. A genuine external edit has no pending token and omits `causedBy`.
     *
     * **The host's own write-echo must stay synchronous.** [handleWrite] sets the
     * causation token, calls `setText` (which fires the listener → here on the same
     * thread), then clears the token in its `finally`. Deferring this send past that
     * `finally` would lose `causedBy` and break echo suppression — the bridge would
     * re-render its own write. So only the *external* path (no pending token) is
     * debounced; the causation path always sends immediately.
     *
     * Called only on the EDT (document mutations require a write action there). The
     * debounced external send is marshalled back to the EDT and guarded by
     * [changeSeq] so it never races, nor reorders against, a host write: if anything
     * superseded it, it aborts rather than re-rendering stale XML.
     */
    fun notifyDocumentChanged(editorId: String, content: String) {
        if (!sessions.containsKey(editorId)) return
        val seq = (changeSeq[editorId] ?: 0L) + 1L
        changeSeq[editorId] = seq

        val causedBy = pendingCausation.remove(editorId)
        if (causedBy != null) {
            debounceTimers.remove(editorId)?.cancel(false)
            sendDidChange(editorId, content, causedBy)
            return
        }
        // External edit: a newer frame resets the timer so only the latest content
        // is sent. The notify itself is non-blocking; debounce just drops frames.
        debounceTimers.remove(editorId)?.cancel(false)
        debounceTimers[editorId] =
            scheduler.schedule(
                {
                    // Send on the EDT so the supersede check and the send are atomic
                    // w.r.t. host writes (also EDT): no write can interleave between
                    // them, and stale frames are dropped rather than reordered after a
                    // dropped causation echo.
                    ApplicationManager.getApplication().invokeLater {
                        debounceTimers.remove(editorId)
                        if (changeSeq[editorId] == seq && sessions.containsKey(editorId)) {
                            sendDidChange(editorId, content, null)
                        }
                    }
                },
                EXTERNAL_DEBOUNCE_MS,
                TimeUnit.MILLISECONDS,
            )
    }

    private fun sendDidChange(editorId: String, content: String, causedBy: Long?) {
        val params = linkedMapOf<String, Any>("editorId" to editorId, "content" to content)
        causedBy?.let { params["causedBy"] = it }
        deps.channel.notify("document/didChange", params)
    }

    /** Tells the core which open editor is focused (drives its active-editor pointer). */
    fun setActiveEditor(editorId: String) {
        if (!sessions.containsKey(editorId)) return
        deps.channel.notify("session/setActive", linkedMapOf("editorId" to editorId))
    }

    /**
     * Requests an SVG export of the open diagram: posts `GetDiagramAsSVGCommand`
     * into the webview and stores [onSvg] to be invoked with the rendered SVG when
     * the webview echoes it back (intercepted in [forwardWebviewMessage]). Returns
     * `false` when no session is open for [editorId] (nothing to ask). A newer
     * request replaces any pending one. No timeout: a webview error surfaces as a
     * `LogErrorCommand`, and a stale pending callback is simply overwritten.
     */
    fun requestDiagramSvg(editorId: String, onSvg: (String) -> Unit): Boolean {
        val session = sessions[editorId] ?: return false
        pendingSvgRequests[editorId] = onSvg
        session.postToWebview(GET_DIAGRAM_SVG_COMMAND)
        return true
    }

    fun disposeSession(editorId: String) {
        sessions.remove(editorId)
        pendingCausation.remove(editorId)
        debounceTimers.remove(editorId)?.cancel(false)
        changeSeq.remove(editorId)
        pendingSvgRequests.remove(editorId)
        // Unblock any close-flush still awaiting a reply so a disposed editor
        // never strands the EDT for the full timeout.
        closeFlushLatches.remove(editorId)?.latch?.countDown()
        deps.channel.notify("session/dispose", linkedMapOf("editorId" to editorId))
    }

    /**
     * Re-seeds every open session into a freshly spawned bridge (the document
     * mirror is rebuilt from the live IntelliJ `Document`, the authoritative
     * source) and replays `GetBpmnFileCommand` so the still-alive JCEF page
     * re-renders without a reload.
     */
    fun reregisterLiveSessions() {
        if (!deps.isProcessAlive()) return
        sessions.values.forEach { session ->
            sendRegister(session)
            forwardWebviewMessage(session.editorId, GET_BPMN_FILE_COMMAND)
        }
    }

    fun clear() {
        sessions.clear()
        pendingSvgRequests.clear()
    }

    // ── core → host ────────────────────────────────────────────────────────────

    /**
     * Writes core-supplied XML into the in-memory Document on the EDT, then replies
     * with whether the content actually changed (the `DocumentPort.write` contract).
     * IntelliJ Documents require `\n`; webview XML may carry `\r\n`.
     */
    private fun handleWrite(params: JsonObject, id: Int?) {
        val editorId = params.get("editorId").asString
        val content = StringUtil.convertLineSeparators(params.get("content").asString)
        val revision = params.get("revision").asLong
        val session = sessions[editorId]
        if (session == null) {
            id?.let { deps.channel.reply(it, mapOf("changed" to false)) }
            return
        }
        ApplicationManager.getApplication().invokeLater {
            var changed = false
            if (!session.project.isDisposed) {
                val document = FileDocumentManager.getInstance().getDocument(session.file)
                // Compare against the Document's live char sequence instead of
                // document.text: the latter allocates a full String copy of the whole
                // file on every write, on the EDT. StringUtil.equals reads the
                // CharSequence in place.
                if (document != null && !StringUtil.equals(document.charsSequence, content)) {
                    // setText synchronously fires the editor's DocumentListener, which
                    // calls notifyDocumentChanged on this thread. Stamp the causation
                    // token first so that echo carries `causedBy`; the listener
                    // removes it, and the finally clears any stray entry if no echo
                    // fired (e.g. a write barren of an actual change).
                    pendingCausation[editorId] = revision
                    try {
                        WriteCommandAction.runWriteCommandAction(session.project) {
                            document.setText(content)
                        }
                    } finally {
                        pendingCausation.remove(editorId)
                    }
                    changed = true
                }
            }
            id?.let { deps.channel.reply(it, mapOf("changed" to changed)) }
        }
    }

    private fun handleSave(params: JsonObject, id: Int?) {
        val editorId = params.get("editorId").asString
        val session = sessions[editorId]
        ApplicationManager.getApplication().invokeLater {
            if (session != null && !session.project.isDisposed) {
                val document = FileDocumentManager.getInstance().getDocument(session.file)
                if (document != null) FileDocumentManager.getInstance().saveDocument(document)
            }
            id?.let { deps.channel.reply(it, mapOf("saved" to true)) }
        }
    }

    // ── close flush ──────────────────────────────────────────────────────────────

    /**
     * Flushes the webview's debounced-but-unsynced changes into the Document
     * before the tab closes, so a close never drops the sub-debounce tail of
     * edits. Called on the EDT from `beforeFileClosed`. Two constraints force
     * this exact shape:
     *
     *  - **`beforeFileClosed`, not `dispose()`.** IntelliJ's Disposer tears down
     *    the editor's children (the JCEF browser) *before* the editor's own
     *    `dispose()` body runs, so a dispose-time post would hit a dead browser.
     *    In `beforeFileClosed` the browser is still alive.
     *  - **no bridge round-trip here.** The reply is applied straight to the
     *    IntelliJ Document; routing it through the bridge's `document/write` would
     *    end in a `WriteCommandAction` that needs the very EDT this method blocks
     *    — a deadlock.
     *
     * Blocks the EDT on a latch ≤[CLOSE_FLUSH_TIMEOUT_MS]; the reply lands on the
     * JCEF handler thread (see [forwardWebviewMessage] → [resolveCloseFlush]), so
     * the block cannot self-deadlock. On XML received we write inline — already on
     * the EDT — before disposal begins. Timeout / no reply / no session simply
     * proceeds with the close; the ≤300ms staleness then self-heals via autosave.
     */
    fun flushBeforeClose(editorId: String) {
        val session = sessions[editorId] ?: return
        val token = closeFlushToken.incrementAndGet()
        val flush = CloseFlush(token)
        closeFlushLatches[editorId] = flush
        try {
            session.postToWebview("{\"type\":\"FlushDocumentQuery\",\"token\":$token}")
            val replied = flush.latch.await(CLOSE_FLUSH_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            val content = flush.content
            if (replied && content != null && !session.project.isDisposed) {
                writeIfChanged(session, content)
            }
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        } finally {
            closeFlushLatches.remove(editorId)
        }
    }

    /**
     * Resolves the armed close-flush latch for [editorId] from a webview message,
     * if that message is the matching `DocumentFlushedCommand`. Cheap-guarded:
     * only parses when a close is actually in progress and the marker is present,
     * so the hot forward path is untouched during normal editing.
     */
    private fun resolveCloseFlush(editorId: String, trimmedMessage: String) {
        val pending = closeFlushLatches[editorId] ?: return
        if (!trimmedMessage.contains(FLUSH_COMMAND_MARKER)) return
        val reply = parseDocumentFlushedReply(trimmedMessage, deps.gson) ?: return
        if (reply.token != pending.token) return
        pending.content = reply.content
        pending.latch.countDown()
    }

    /** Writes [rawContent] into the Document unless byte-identical (line-normalised). */
    private fun writeIfChanged(session: CoreSession, rawContent: String) {
        // IntelliJ Documents require `\n`; webview XML may carry `\r\n` (as handleWrite does).
        val content = StringUtil.convertLineSeparators(rawContent)
        val document = FileDocumentManager.getInstance().getDocument(session.file) ?: return
        if (StringUtil.equals(document.charsSequence, content)) return
        WriteCommandAction.runWriteCommandAction(session.project) {
            document.setText(content)
        }
    }

    /** One in-flight close-flush round-trip: its token, the EDT's latch, and the reply. */
    private class CloseFlush(val token: Long) {
        val latch = CountDownLatch(1)

        @Volatile
        var content: String? = null
    }

    private companion object {
        const val GET_BPMN_FILE_COMMAND = "{\"type\":\"GetBpmnFileCommand\"}"

        // Posted into the webview to request an SVG export; the webview echoes the
        // same command back with the rendered `svg` field populated.
        const val GET_DIAGRAM_SVG_COMMAND = "{\"type\":\"GetDiagramAsSVGCommand\"}"

        // The webview shim's compact JSON.stringify emits exactly this substring for
        // the echoed GetDiagramAsSVGCommand, so a substring match spots the echo
        // without a full parse on the forward thread (same pattern as the sync marker).
        const val SVG_COMMAND_MARKER = "\"type\":\"GetDiagramAsSVGCommand\""

        // The webview shim's compact JSON.stringify emits exactly this substring for
        // a SyncDocumentCommand, so a substring match replaces a full JSON parse on
        // the forward thread.
        const val SYNC_COMMAND_MARKER = "\"type\":\"SyncDocumentCommand\""

        // The webview's compact JSON.stringify emits exactly this substring for a
        // DocumentFlushedCommand, so a substring test gates the parse on the close path.
        const val FLUSH_COMMAND_MARKER = "\"type\":\"DocumentFlushedCommand\""

        // Long enough to collapse a typing burst into one re-render, short enough
        // that an external edit (git checkout) feels immediate.
        const val EXTERNAL_DEBOUNCE_MS = 150L

        // Upper bound the EDT will block on a close flush. The webview export is
        // ~10-50ms; this leaves margin without a perceptible freeze on tab close.
        const val CLOSE_FLUSH_TIMEOUT_MS = 250L
    }
}

/** Parsed `DocumentFlushedCommand`; `content` is null when the webview had nothing to flush. */
internal data class DocumentFlushedReply(val token: Long, val content: String?)

/**
 * Parses a webview message as a `DocumentFlushedCommand`, or returns null if it
 * is not one / is malformed. Extracted as a pure function so the close-flush
 * reply handling is unit-testable without a running bridge or EDT.
 */
internal fun parseDocumentFlushedReply(raw: String, gson: Gson): DocumentFlushedReply? =
    try {
        val obj = gson.fromJson(raw, JsonObject::class.java)
        val token = obj?.get("token")
        when {
            obj?.get("type")?.asString != "DocumentFlushedCommand" -> null
            token == null || token.isJsonNull -> null
            else -> {
                val content = obj.get("content")
                DocumentFlushedReply(
                    token.asLong,
                    if (content == null || content.isJsonNull) null else content.asString,
                )
            }
        }
    } catch (e: Exception) {
        null
    }
