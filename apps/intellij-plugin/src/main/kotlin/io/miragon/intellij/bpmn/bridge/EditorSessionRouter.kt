package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.stream.JsonToken
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.ControlFlowException
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileDocumentManagerListener
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Computable
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.AppExecutorUtil
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.ModelerSettingsStore
import java.io.StringReader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * Routes the BPMN-editor feature: open-session registration, document-port
 * fulfilment (`document/write` / `document/save`) against the real IntelliJ
 * `Document`, and core→webview message delivery. Sessions are keyed by editor id
 * so messages reach the right JCEF browser when several `.bpmn` files are open.
 *
 * @param scheduler Debounces external `document/didChange` frames. Injectable so
 *   tests step time deterministically instead of waiting on the shared pool.
 * @param readDocumentText Reads the content a `session/register` frame seeds.
 *   Injectable so tests can close a tab while its register frame is built.
 * @param selectedEditorIds The editor ids of the tabs selected in the editor
 *   windows, the focused window's first. Injectable because tests open no tabs.
 */
internal class EditorSessionRouter(
    private val deps: BridgeDeps,
    private val scheduler: ScheduledExecutorService = AppExecutorUtil.getAppScheduledExecutorService(),
    private val readDocumentText: (VirtualFile) -> String = ::readDocumentTextInReadAction,
    private val selectedEditorIds: () -> List<String> = { selectedEditorIdsOf(deps.project) },
) {
    private val log = Logger.getInstance(EditorSessionRouter::class.java)

    private class SessionEntry(
        val session: CoreSession,
        val sessionId: Long,
        val documentRevision: AtomicLong = AtomicLong(0),
    ) {
        // The page keeps only the token of the last destructive flush it
        // received, so only that flush's recovery may hold it.
        private var lastLockingFlushToken = NO_RENDER_LOCK

        // The flush token a recovery keeps the page locked with until a render reaches it.
        private val renderLockToken = AtomicLong(NO_RENDER_LOCK)

        // Page content the host wrote into the Document without the core. The
        // core's mirror lacks it until a write of that content reports a change.
        private val unmirroredContent = AtomicReference<String?>(null)

        /** Posts the flush [query] for [token], ordered against [holdRenderLock]. */
        @Synchronized
        fun postFlush(token: Long, query: String, locksPage: Boolean) {
            if (locksPage) lastLockingFlushToken = token
            session.postToWebview(query)
        }

        /** Holds [token] until a render arrives; false when the page got a newer destructive flush since. */
        @Synchronized
        fun holdRenderLock(token: Long): Boolean {
            if (token != lastLockingFlushToken) return false
            renderLockToken.set(token)
            return true
        }

        fun rememberUnmirroredContent(content: String) = unmirroredContent.set(content)

        fun forgetUnmirroredContent() = unmirroredContent.set(null)

        fun takeUnmirroredContent(): String? = unmirroredContent.getAndSet(null)

        /** The token the arriving render unlocks, or null when the page is not held. */
        fun takeRenderLock(): Long? = renderLockToken.getAndSet(NO_RENDER_LOCK).takeIf { it != NO_RENDER_LOCK }

        /** Gives up the hold on [token] unless a render or a newer recovery already took it. */
        fun abandonRenderLock(token: Long): Boolean = renderLockToken.compareAndSet(token, NO_RENDER_LOCK)
    }

    private val sessions = ConcurrentHashMap<String, SessionEntry>()
    private val nextSessionId = AtomicLong(0)

    // Editors whose Document [setTextWithoutEcho] is setting. The synchronous
    // `DocumentListener` call that `setText` triggers sees the marker and sends
    // nothing: the content came from the bridge or from the page itself, so a
    // `document/didChange` would only render the page's own content back into it.
    private val editorsSettingTextWithoutEcho: MutableSet<String> = ConcurrentHashMap.newKeySet()

    // Per-editor debounce timer for *external* edits only (raw-text tab, git
    // checkout, another tool). A newer keystroke cancels and reschedules, so the
    // per-keystroke full-XML round trip + re-render collapses to one send per pause.
    private val debounceTimers = ConcurrentHashMap<String, ScheduledFuture<*>>()

    // External host content stays authoritative until the core has posted that
    // exact content back to the webview for import.
    private data class PendingHostUpdate(val content: String, val revision: Long)

    private val hostUpdatesAwaitingWebview = ConcurrentHashMap<String, PendingHostUpdate>()

    // Monotonic per-editor change counter. Every change (core write or external)
    // bumps it; a debounced external send captures the value at schedule time and
    // sends only if still current at fire time, so a change that superseded it —
    // crucially a core write, which sends no didChange of its own — never gets
    // re-rendered as a stale external edit. Bumped and read only on the EDT.
    private val changeSeq = ConcurrentHashMap<String, Long>()

    // Per-editor pending SVG-export callback. `GetDiagramAsSVGCommand` round-trips
    // straight through the JS↔JVM webview pipe (no bridge/protocol involvement): the
    // host posts the command, the webview echoes it back with the rendered `svg`,
    // and [forwardWebviewMessage] intercepts that echo and invokes the callback. A
    // newer request replaces the pending one (mirrors VS Code disposing the previous).
    private val pendingSvgRequests = ConcurrentHashMap<String, (String) -> Unit>()

    // Page flushes in flight, per editor and token: a save, a tab close and a
    // recovery can each wait on a flush of the same page, and the page answers
    // all of them. Armed by [recoverPageEdits] before IntelliJ saves, a tab
    // closes or a respawn re-registers, resolved by [resolvePageFlush] on the
    // JCEF handler thread when the webview's `DocumentFlushedCommand` lands.
    // Kept off [sessions] because each lives for a single ≤250ms round-trip.
    private val pageFlushes = ConcurrentHashMap<String, ConcurrentHashMap<Long, PageFlush>>()

    // Monotonic token so a late flush reply can't satisfy a newer flush request.
    // Counts down from -1 because the core counts its flushes up from 1 and
    // every page reply reaches both, so neither takes the other's reply or lock.
    private val pageFlushToken = AtomicLong(0)

    fun register() {
        // IntelliJ fires this on the EDT before it reads which Documents are
        // unsaved, so a Document the flush writes is saved in the same pass.
        ApplicationManager.getApplication().messageBus.connect(deps.parentDisposable).subscribe(
            FileDocumentManagerListener.TOPIC,
            object : FileDocumentManagerListener {
                override fun beforeAllDocumentsSaving() = flushBeforeSave()
            },
        )

        deps.handlers
            .on("editor/postMessage") { params ->
                val editorId = params.string("editorId")
                val sessionId = params.optionalLong("sessionId")
                val message = params.jsonObject("message")
                RpcAction { deliverToWebview(editorId, sessionId, message) }
            }
            .on("document/write") { params ->
                val editorId = params.string("editorId")
                val sessionId = params.optionalLong("sessionId")
                val writtenContent = params.string("content")
                val expectedDocumentRevision = params.optionalLong("expectedDocumentRevision")
                RpcAction { id -> handleWrite(editorId, sessionId, writtenContent, expectedDocumentRevision, id) }
            }
            .on("document/save") { params ->
                val editorId = params.string("editorId")
                val sessionId = params.optionalLong("sessionId")
                RpcAction { id -> handleSave(editorId, sessionId, id) }
            }
    }

    // ── host → core ────────────────────────────────────────────────────────────

    /** Registers an editor and tells the core to open it (seeding the document mirror). */
    fun registerSession(session: CoreSession) {
        val entry = SessionEntry(session, nextSessionId.incrementAndGet())
        sessions.put(session.editorId, entry)?.let { resetSessionState(session.editorId) }
        // Enqueue the register frame now and spawn off the EDT: the outbound queue
        // buffers it until the writer exists, so editor construction never blocks on
        // the (occasionally seconds-long) process start.
        sendRegister(entry)
        deps.ensureStartedAsync()
    }

    private fun sendRegister(entry: SessionEntry) {
        val session = entry.session
        // The register seeds the core's mirror from the Document. Forgotten
        // before the read, so a page write the read misses keeps its claim.
        entry.forgetUnmirroredContent()
        val content = readDocumentText(session.file)
        deps.channel.notify(
            "session/register",
            linkedMapOf(
                "editorId" to session.editorId,
                "sessionId" to entry.sessionId,
                "documentRevision" to entry.documentRevision.get(),
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
    fun forwardWebviewMessage(session: CoreSession, rawMessage: String) {
        val entry = sessions[session.editorId] ?: return
        if (entry.session !== session) return
        forwardWebviewMessage(entry, rawMessage)
    }

    private fun forwardWebviewMessage(entry: SessionEntry, rawMessage: String) {
        val editorId = entry.session.editorId
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
        val isSyncCommand = trimmed.contains(SYNC_COMMAND_MARKER)
        if (isSyncCommand) {
            if (hasPendingExternalUpdate(editorId)) return
            val syncRevision = readTopLevelLong(trimmed, "documentRevision", deps.gson)
            if ((syncRevision ?: 0L) < entry.documentRevision.get()) return
        }
        // Capture page-flush replies and forced normal-sync fallbacks while
        // [recoverPageEdits] waits. Messages still reach the core below.
        resolvePageFlush(editorId, trimmed, isSyncCommand)
        // Document syncs fire once per diagram edit and supersede each other — only
        // the latest XML matters for write-back — so collapse queued ones.
        val coalesceKey = if (isSyncCommand) "sync:$editorId" else null
        // Splice the raw message in as the `message` value rather than parse →
        // re-serialise. editorId goes through gson so it is correctly JSON-escaped.
        val frame =
             "{\"method\":\"webview/message\",\"params\":{\"editorId\":" +
                deps.gson.toJson(editorId) +
                ",\"sessionId\":" + entry.sessionId +
                ",\"message\":" + rawMessage + "}}"
        deps.channel.notifyRaw(frame, coalesceKey)
    }

    /**
     * Forwards an external document change (git revert/checkout, the plain-text
     * tab, another tool) to the core so the diagram re-renders. A change caused by
     * [handleWrite] or a page flush is not forwarded, so only the supersede
     * bookkeeping runs and [readContent] is never called — no full-document copy
     * per diagram edit.
     *
     * **[setTextWithoutEcho] relies on this running synchronously inside `setText`.**
     * It marks the editor in [editorsSettingTextWithoutEcho] only for the duration of
     * the write action, so a deferred listener would mistake the write for an
     * external edit and send it back.
     *
     * Called only on the EDT (document mutations require a write action there). The
     * debounced external send is marshalled back to the EDT and guarded by
     * [changeSeq] so it never races, nor reorders against, a core write: if anything
     * superseded it, it aborts rather than re-rendering stale XML.
     */
    fun notifyDocumentChanged(session: CoreSession, readContent: () -> String) {
        val entry = sessions[session.editorId] ?: return
        if (entry.session !== session) return
        val editorId = session.editorId
        val seq = (changeSeq[editorId] ?: 0L) + 1L
        changeSeq[editorId] = seq

        if (editorId in editorsSettingTextWithoutEcho) {
            debounceTimers.remove(editorId)?.cancel(false)
            return
        }
        // The external content reaches the core's mirror through the didChange.
        entry.forgetUnmirroredContent()
        val content = readContent()
        val documentRevision = entry.documentRevision.incrementAndGet()
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
                        if (changeSeq[editorId] == seq && sessions[editorId] === entry) {
                            sendDidChange(entry, content, documentRevision)
                        }
                    }
                },
                EXTERNAL_DEBOUNCE_MS,
                TimeUnit.MILLISECONDS,
            )
    }

    private fun sendDidChange(
        entry: SessionEntry,
        content: String,
        documentRevision: Long,
    ) {
        val editorId = entry.session.editorId
        hostUpdatesAwaitingWebview[editorId] = PendingHostUpdate(content, documentRevision)
        deps.channel.notify(
            "document/didChange",
            linkedMapOf(
                "editorId" to editorId,
                "sessionId" to entry.sessionId,
                "content" to content,
                "documentRevision" to documentRevision,
            ),
            coalesceKey = "document:$editorId",
            reliable = true,
        )
    }

    /**
     * Whether an external edit is still debounced or has not reached the page
     * yet. Until it has, the host copy wins over anything the page sends.
     */
    private fun hasPendingExternalUpdate(editorId: String): Boolean =
        debounceTimers.containsKey(editorId) || hostUpdatesAwaitingWebview.containsKey(editorId)

    /** Tells the core which open editor is focused (drives its active-editor pointer). */
    fun setActiveEditor(editorId: String) {
        val entry = sessions[editorId] ?: return
        deps.channel.notify(
            "session/setActive",
            linkedMapOf("editorId" to editorId, "sessionId" to entry.sessionId),
        )
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
        val session = sessions[editorId]?.session ?: return false
        pendingSvgRequests[editorId] = onSvg
        session.postToWebview(GET_DIAGRAM_SVG_COMMAND)
        return true
    }

    fun disposeSession(session: CoreSession) {
        val editorId = session.editorId
        val entry = sessions[editorId] ?: return
        if (entry.session !== session || !sessions.remove(editorId, entry)) return
        resetSessionState(editorId)
        sendDispose(entry)
    }

    private fun sendDispose(entry: SessionEntry) {
        deps.channel.notify(
            "session/dispose",
            linkedMapOf("editorId" to entry.session.editorId, "sessionId" to entry.sessionId),
        )
    }

    private fun resetSessionState(editorId: String) {
        editorsSettingTextWithoutEcho.remove(editorId)
        debounceTimers.remove(editorId)?.cancel(false)
        hostUpdatesAwaitingWebview.remove(editorId)
        changeSeq.remove(editorId)
        pendingSvgRequests.remove(editorId)
        // Unblock any page flush still awaiting a reply so a disposed editor
        // never strands the waiting thread for the full timeout.
        pageFlushes.remove(editorId)?.values?.forEach { it.latch.countDown() }
    }

    /**
     * Re-seeds every open session into the bridge (the document mirror is
     * rebuilt from the live IntelliJ `Document`, the authoritative source) and
     * replays `GetBpmnFileCommand` so the still-alive JCEF page re-renders
     * without a reload. The replayed render re-imports the Document, so
     * [recoverPageEdits] first writes the edits the Document never received (a
     * sync dropped in the restart window or still debounced), and the page stays
     * locked until a render reaches it.
     *
     * A replayed render does not make the page ask for the lint config again,
     * so `GetBpmnlintConfigCommand` is replayed too: a new bridge holds no lint
     * state for the page, and the stored lint choice may have changed while the
     * bridge was down.
     *
     * Ends with `session/setActive` for the first selected tab that is a
     * diagram, the focused window's first. With no diagram tab selected, the
     * session replayed last keeps the command target.
     *
     * Waits up to [PAGE_FLUSH_TIMEOUT_MS] for the pages' replies; off the EDT it
     * then also waits until the EDT has written any export, which an open modal
     * dialog delays.
     */
    fun reregisterLiveSessions() {
        if (!deps.isProcessAlive()) return
        val entries = sessions.values.toList()
        val flushesByEntry = recoverPageEdits(entries, PageFlushPurpose.CLOSE_OR_RERENDER).associateBy { it.entry }
        entries.forEach { entry ->
            if (sessions[entry.session.editorId] !== entry) return@forEach
            // Armed before the replay goes out, so its render cannot overtake the hold.
            flushesByEntry[entry]?.let(::holdUntilRendered)
            if (!reregisterCurrentOwner(entry)) return@forEach
            forwardWebviewMessage(entry, GET_BPMN_FILE_COMMAND)
            forwardWebviewMessage(entry, GET_BPMNLINT_CONFIG_COMMAND)
        }
        focusSelectedEditor()
    }

    /**
     * Returns whether [entry] still owns its editor id. A tab closed or reopened
     * while a register frame was built sent its own frames ahead of it, and the
     * bridge keeps whichever register comes last, so the owner's register or a
     * dispose must follow.
     */
    private fun reregisterCurrentOwner(entry: SessionEntry): Boolean {
        var registered = entry
        while (true) {
            sendRegister(registered)
            val owner = sessions[registered.session.editorId]
            if (owner === registered) return registered === entry
            sendDispose(registered)
            registered = owner ?: return false
        }
    }

    // The bridge takes every register for the focused tab, so the session replayed last would keep the command target.
    private fun focusSelectedEditor() {
        // A disposed project has no sessions left, and its FileEditorManager can no longer be asked.
        if (sessions.isEmpty()) return
        selectedEditorIds().firstOrNull(sessions::containsKey)?.let(::setActiveEditor)
    }

    fun clear() {
        debounceTimers.values.forEach { it.cancel(false) }
        sessions.clear()
        editorsSettingTextWithoutEcho.clear()
        debounceTimers.clear()
        hostUpdatesAwaitingWebview.clear()
        changeSeq.clear()
        pendingSvgRequests.clear()
        pageFlushes.values.forEach { inFlight -> inFlight.values.forEach { it.latch.countDown() } }
        pageFlushes.clear()
    }

    // ── core → host ────────────────────────────────────────────────────────────

    private fun deliverToWebview(editorId: String, sessionId: Long?, message: JsonObject) {
        val entry = sessions[editorId] ?: return
        if (!matchesSession(sessionId, entry)) return
        val query = message.takeIf { it.get("type")?.asStringOrNull() == BPMN_FILE_QUERY_TYPE }
        val delivered = query?.get("content")?.asStringOrNull()
        val deliveredRevision =
            query?.get("documentRevision")
                ?.takeIf { !it.isJsonNull }
                ?.asLong
        if (deliveredRevision != null) {
            if (deliveredRevision < entry.documentRevision.get()) return
        }
        entry.session.postToWebview(deps.gson.toJson(message))
        if (query != null) {
            entry.takeRenderLock()?.let { entry.session.postToWebview(releaseFlushQuery(it)) }
            val expected = hostUpdatesAwaitingWebview[editorId]
            if (
                expected != null &&
                (
                    deliveredRevision?.let { it >= expected.revision } == true ||
                        (
                            deliveredRevision == null &&
                                delivered != null &&
                                StringUtil.equals(
                                    StringUtil.convertLineSeparators(expected.content),
                                    StringUtil.convertLineSeparators(delivered),
                                )
                        )
                )
            ) {
                hostUpdatesAwaitingWebview.remove(editorId, expected)
            }
        }
    }

    private fun matchesSession(sessionId: Long?, entry: SessionEntry): Boolean =
        sessionId == null || sessionId == entry.sessionId

    /**
     * Writes core-supplied XML into the in-memory Document on the EDT, then replies
     * with whether the content actually changed (the `DocumentPort.write` contract).
     * IntelliJ Documents require `\n`; webview XML may carry `\r\n`, in which case
     * the reply returns the normalised bytes so the bridge's mirror stays exact.
     *
     * The bridge's mirror takes content only from a write that reports a change,
     * so a write of content a page flush already put into the Document reports
     * one too: the core never heard of that flush.
     */
    private fun handleWrite(
        editorId: String,
        sessionId: Long?,
        writtenContent: String,
        expectedDocumentRevision: Long?,
        id: CoreRequestId?,
    ) {
        val content = StringUtil.convertLineSeparators(writtenContent)
        val entry = sessions[editorId]
        if (entry == null || !matchesSession(sessionId, entry)) {
            id?.let { deps.channel.reply(it, DocumentWriteResult(changed = false, accepted = false)) }
            return
        }
        deps.channel.replyFromEdt(id, "document/write") {
            if (
                sessions[editorId] !== entry ||
                (expectedDocumentRevision == null && hasPendingExternalUpdate(editorId)) ||
                (expectedDocumentRevision != null &&
                    expectedDocumentRevision != entry.documentRevision.get())
            ) {
                return@replyFromEdt DocumentWriteResult(changed = false, accepted = false)
            }
            var changed = false
            val session = entry.session
            val unmirroredContent = entry.takeUnmirroredContent()
            if (!session.project.isDisposed) {
                val document = FileDocumentManager.getInstance().getDocument(session.file)
                // Compare against the Document's live char sequence instead of
                // document.text: the latter allocates a full String copy of the whole
                // file on every write, on the EDT. StringUtil.equals reads the
                // CharSequence in place.
                if (document != null && !StringUtil.equals(document.charsSequence, content)) {
                    try {
                        setTextWithoutEcho(session, document, content)
                    } catch (e: Exception) {
                        // The reply is the bridge mirror's only update, so a throw
                        // after setText took effect must still report the change.
                        val documentTookContent = StringUtil.equals(document.charsSequence, content)
                        if (e is ControlFlowException || !documentTookContent) throw e
                        log.warn("Core write threw after the Document took the content", e)
                    }
                    changed = true
                } else if (document != null) {
                    changed = unmirroredContent == content
                }
            }
            writeResult(changed, writtenContent, content)
        }
    }

    private fun writeResult(changed: Boolean, writtenContent: String, normalizedContent: String) =
        DocumentWriteResult(
            changed = changed,
            accepted = true,
            normalizedContent = normalizedContent.takeIf { changed && it != writtenContent },
        )

    private fun handleSave(editorId: String, sessionId: Long?, id: CoreRequestId?) {
        val entry = sessions[editorId]
        deps.channel.replyFromEdt(id, "document/save") {
            val liveSession =
                entry?.session?.takeIf {
                    sessions[editorId] === entry && matchesSession(sessionId, entry) && !it.project.isDisposed
                }
            val documentManager = FileDocumentManager.getInstance()
            val document = liveSession?.let { documentManager.getDocument(it.file) }
            // A veto, a memory/disk conflict or a write error leaves the Document
            // unsaved without throwing.
            if (document != null) documentManager.saveDocument(document)
            DocumentSaveResult(saved = document != null && !documentManager.isDocumentUnsaved(document))
        }
    }

    // ── page flush (save, close and respawn) ─────────────────────────────────────

    /**
     * Writes each page's unsynced edit into its Document before IntelliJ saves
     * (Ctrl+S, autosave, frame deactivation), so the save persists what the
     * page shows. The page stays editable and its sync stays armed, so the core
     * still gets the edit; a page that does not answer in time is saved as it
     * is. Runs on the EDT, also when 2026.1 saves in the background: the
     * platform hands the event to the EDT while the saving thread holds no lock.
     */
    private fun flushBeforeSave() {
        recoverPageEdits(sessions.values.toList(), PageFlushPurpose.SAVE)
    }

    /**
     * Flushes the webview's debounced-but-unsynced changes into the Document
     * before the tab closes, so a close never drops the sub-debounce tail of
     * edits. Called on the EDT from `beforeFileClosed`, not `dispose()`:
     * IntelliJ's Disposer tears down the editor's children (the JCEF browser)
     * *before* the editor's own `dispose()` body runs, so a dispose-time post
     * would hit a dead browser.
     */
    fun flushBeforeClose(editorId: String) {
        val entry = sessions[editorId] ?: return
        recoverPageEdits(listOf(entry), PageFlushPurpose.CLOSE_OR_RERENDER).forEach { flush ->
            if (!flush.replied) entry.session.postToWebview(releaseFlushQuery(flush.token))
        }
    }

    /**
     * Writes each page's export into its Document while the Document revision
     * still matches, so neither a save, a close nor a replayed render drops
     * edits the Document never received. A page with a pending external host
     * update is skipped: the host copy is authoritative. So is a page whose
     * flush cannot be posted, and the other pages still get theirs. A
     * [PageFlushPurpose.CLOSE_OR_RERENDER] flush is destructive and also
     * exports a page edited since its last render whose sync already went out,
     * because that sync may have been dropped. A page nobody edited since then
     * answers `clean`, so its Document keeps its text. That flush leaves each
     * posted page locked for the caller to release.
     *
     * The reply goes straight into the Document: the bridge's `document/write`
     * would need the EDT a save or a close blocks. All replies share one
     * ≤[PAGE_FLUSH_TIMEOUT_MS] wait and land on the JCEF handler thread
     * ([resolvePageFlush]), so an EDT caller cannot self-deadlock. A sync the
     * page sends during the wait is written like a reply when the page could not
     * export, and on a save also when it had nothing left to export.
     */
    private fun recoverPageEdits(entries: List<SessionEntry>, purpose: PageFlushPurpose): List<PageFlush> {
        val flushes = entries.mapNotNull { requestPageFlush(it, purpose) }
        if (flushes.isEmpty()) return flushes
        val repliesAwaited = awaitReplies(flushes)
        flushes.forEach(::removePageFlush)
        // Off the EDT the hop waits behind an open modal dialog, so skip it when no page exported anything.
        val anyPageExported = flushes.any { it.content != null }
        if (repliesAwaited && anyPageExported) onEdtAndWait { flushes.forEach(::writeFlushedContent) }
        return flushes
    }

    private fun requestPageFlush(entry: SessionEntry, purpose: PageFlushPurpose): PageFlush? {
        val editorId = entry.session.editorId
        if (hasPendingExternalUpdate(editorId)) return null
        val flush = PageFlush(entry, pageFlushToken.decrementAndGet(), entry.documentRevision.get(), purpose)
        pageFlushes.compute(editorId) { _, inFlight ->
            (inFlight ?: ConcurrentHashMap()).apply { put(flush.token, flush) }
        }
        try {
            entry.postFlush(
                flush.token,
                "{\"type\":\"FlushDocumentQuery\",\"token\":${flush.token}," +
                    "\"destructive\":${purpose.destructive},\"exportWhenEdited\":${purpose.exportWhenEdited}}",
                locksPage = purpose.destructive,
            )
        } catch (e: Exception) {
            // A page the host cannot post into is skipped; the other pages still recover.
            if (e is ControlFlowException) throw e
            removePageFlush(flush)
            log.warn("Could not post the page flush into $editorId", e)
            return null
        }
        return flush
    }

    private fun removePageFlush(flush: PageFlush) {
        // An editor with no flush in flight has no entry, so [resolvePageFlush] stays a map miss.
        pageFlushes.computeIfPresent(flush.entry.session.editorId) { _, inFlight ->
            inFlight.remove(flush.token)
            inFlight.takeIf { it.isNotEmpty() }
        }
    }

    /** Returns `false` when interrupted, so no reply is written. */
    private fun awaitReplies(flushes: List<PageFlush>): Boolean {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(PAGE_FLUSH_TIMEOUT_MS)
        return try {
            flushes.forEach { it.latch.await(deadline - System.nanoTime(), TimeUnit.NANOSECONDS) }
            true
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
    }

    private fun writeFlushedContent(flush: PageFlush) {
        val entry = flush.entry
        val content = flush.content ?: return
        val exportStillCurrent =
            pageFlushRevisionMatches(flush.expectedDocumentRevision, flush.contentRevision) &&
                sessions[entry.session.editorId] === entry &&
                entry.documentRevision.get() == flush.expectedDocumentRevision &&
                !entry.session.project.isDisposed
        if (!exportStillCurrent) return
        try {
            writeIfChanged(entry, content)
        } catch (e: Exception) {
            // A Document can refuse the write (a non-writable file); the other
            // pages still get theirs.
            if (e is ControlFlowException) throw e
            log.warn("Could not write the page's content into ${entry.session.editorId}", e)
        }
    }

    private fun onEdtAndWait(action: () -> Unit) {
        val application = ApplicationManager.getApplication()
        if (application.isDispatchThread) action() else application.invokeAndWait(action)
    }

    /**
     * Keeps a recovered page locked until a render reaches it, or
     * [RENDER_REPLAY_TIMEOUT_MS] passed: a bridge that never answers the replay
     * must not leave the page inert. A page that got a newer destructive flush
     * since is left to the recovery or close that posted it.
     */
    private fun holdUntilRendered(flush: PageFlush) {
        val entry = flush.entry
        if (!entry.holdRenderLock(flush.token)) return
        scheduler.schedule(
            {
                // A closed page's browser is already disposed.
                if (entry.abandonRenderLock(flush.token) && sessions[entry.session.editorId] === entry) {
                    entry.session.postToWebview(releaseFlushQuery(flush.token))
                }
            },
            RENDER_REPLAY_TIMEOUT_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun releaseFlushQuery(token: Long) = "{\"type\":\"ReleaseDocumentFlushQuery\",\"token\":$token}"

    /**
     * Resolves the page flush in flight for [editorId] whose token a
     * `DocumentFlushedCommand` names, and copies a forced normal sync into every
     * flush in flight for it. Cheap-guarded: only parses when a flush is
     * actually in progress and the marker is present, so the hot forward path is
     * untouched during normal editing.
     */
    private fun resolvePageFlush(editorId: String, trimmedMessage: String, isSyncCommand: Boolean) {
        val inFlight = pageFlushes[editorId] ?: return
        if (isSyncCommand) {
            parseSyncDocumentReply(trimmedMessage, deps.gson)?.let { sync ->
                inFlight.values.forEach { it.captureSync(sync) }
            }
            return
        }
        if (!trimmedMessage.contains(FLUSH_COMMAND_MARKER)) return
        val reply = parseDocumentFlushedReply(trimmedMessage, deps.gson) ?: return
        inFlight[reply.token]?.resolve(reply)
    }

    /** Writes the page's [rawContent] into the Document unless byte-identical (line-normalised). */
    private fun writeIfChanged(entry: SessionEntry, rawContent: String) {
        val session = entry.session
        // IntelliJ Documents require `\n`; webview XML may carry `\r\n` (as handleWrite does).
        val content = StringUtil.convertLineSeparators(rawContent)
        val document = FileDocumentManager.getInstance().getDocument(session.file) ?: return
        if (StringUtil.equals(document.charsSequence, content)) return
        // First, so a listener that throws after setText still leaves the claim.
        // After a refused write, a write of this content changes the Document anyway.
        entry.rememberUnmirroredContent(content)
        // The page already shows this content: rendering it back at a new
        // revision would re-import it over the page.
        setTextWithoutEcho(session, document, content)
    }

    /** Sets [content] so the synchronous [notifyDocumentChanged] call does not take it for an external edit. */
    private fun setTextWithoutEcho(session: CoreSession, document: Document, content: String) {
        editorsSettingTextWithoutEcho.add(session.editorId)
        try {
            WriteCommandAction.runWriteCommandAction(session.project) {
                document.setText(content)
            }
        } finally {
            editorsSettingTextWithoutEcho.remove(session.editorId)
        }
    }

    /** The `FlushDocumentQuery` flags each host path sends. */
    private enum class PageFlushPurpose(val destructive: Boolean, val exportWhenEdited: Boolean) {
        // The Document may lack a sync the page already sent, and the page must
        // take no edit until it closes or a render replaces its content.
        CLOSE_OR_RERENDER(destructive = true, exportWhenEdited = true),

        // The page stays editable and its sync stays armed, so the core still gets the edit.
        SAVE(destructive = false, exportWhenEdited = false),
        ;

        // A non-destructive flush answers `clean` once the page's sync went out,
        // so a sync caught during the wait is the page's newest edit. A
        // destructive one drains its own sync and answers `clean` only for a page
        // unedited since its last host import, which a caught sync predates.
        val cleanReplyKeepsCapturedSync: Boolean get() = !destructive
    }

    /** One in-flight page-flush round-trip: its session, token, latch, and the reply. */
    private class PageFlush(
        val entry: SessionEntry,
        val token: Long,
        val expectedDocumentRevision: Long,
        private val purpose: PageFlushPurpose,
    ) {
        val latch = CountDownLatch(1)

        val replied: Boolean get() = latch.count == 0L

        @Volatile
        var content: String? = null
            private set

        @Volatile
        var contentRevision: Long? = null
            private set

        /** Keeps a sync the page sent during the wait, which [pageFlushContent] may fall back to. */
        fun captureSync(sync: SyncDocumentReply) {
            content = sync.content
            contentRevision = sync.documentRevision
        }

        fun resolve(reply: DocumentFlushedReply) {
            content = pageFlushContent(content, reply, purpose.cleanReplyKeepsCapturedSync)
            if (reply.status == "flushed") contentRevision = reply.documentRevision
            latch.countDown()
        }
    }

    private companion object {
        const val GET_BPMN_FILE_COMMAND = "{\"type\":\"GetBpmnFileCommand\"}"

        const val GET_BPMNLINT_CONFIG_COMMAND = "{\"type\":\"GetBpmnlintConfigCommand\"}"

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

        const val BPMN_FILE_QUERY_TYPE = "BpmnFileQuery"

        // The webview's compact JSON.stringify emits exactly this substring for a
        // DocumentFlushedCommand, so a substring test gates the parse on the flush path.
        const val FLUSH_COMMAND_MARKER = "\"type\":\"DocumentFlushedCommand\""

        // Long enough to collapse a typing burst into one re-render, short enough
        // that an external edit (git checkout) feels immediate.
        const val EXTERNAL_DEBOUNCE_MS = 150L

        // Upper bound the caller (the EDT on a save or close) blocks on a page flush. The
        // webview export is ~10-50ms; this leaves margin without a perceptible freeze.
        const val PAGE_FLUSH_TIMEOUT_MS = 250L

        // Covers a respawned bridge re-seeding a session before it renders; past
        // it the page takes edits again even without the replayed render.
        const val RENDER_REPLAY_TIMEOUT_MS = 5_000L

        // [pageFlushToken] never hands out 0.
        const val NO_RENDER_LOCK = 0L
    }
}

/** The text of [file]'s Document, empty when it has none; callable from any thread. */
internal fun readDocumentTextInReadAction(file: VirtualFile): String =
    ApplicationManager.getApplication().runReadAction(
        Computable { FileDocumentManager.getInstance().getDocument(file)?.text.orEmpty() },
    )

/**
 * The editor ids of the files selected in [project]'s editor windows, the focused window's first.
 * Read on the EDT: elsewhere the platform lists the main window's first.
 */
internal fun selectedEditorIdsOf(project: Project): List<String> {
    val readSelection = {
        if (project.isDisposed) emptyList() else FileEditorManager.getInstance(project).selectedFiles.map { it.url }
    }
    val application = ApplicationManager.getApplication()
    if (application.isDispatchThread) return readSelection()
    var selected = emptyList<String>()
    // Only a read, so an open modal dialog need not delay the crash recovery.
    application.invokeAndWait({ selected = readSelection() }, ModalityState.any())
    return selected
}

/** Parsed `DocumentFlushedCommand`; status defaults support an older staged webview. */
internal data class DocumentFlushedReply(
    val token: Long,
    val content: String?,
    val status: String,
    val documentRevision: Long? = null,
)

internal data class SyncDocumentReply(val content: String, val documentRevision: Long?)

/**
 * Parses a webview message as a `DocumentFlushedCommand`, or returns null if it
 * is not one / is malformed. Extracted as a pure function so the page-flush
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
                val content = obj.get("content")?.takeIf { !it.isJsonNull }?.asString
                val status =
                    obj.get("status")?.takeIf { !it.isJsonNull }?.asString
                        ?: if (content == null) "clean" else "flushed"
                DocumentFlushedReply(
                    token.asLong,
                    content,
                    status,
                    obj.get("documentRevision")?.takeIf { !it.isJsonNull }?.asLong,
                )
            }
        }
    } catch (_: Exception) {
        null
    }

internal fun parseSyncDocumentReply(raw: String, gson: Gson): SyncDocumentReply? =
    try {
        val obj = gson.fromJson(raw, JsonObject::class.java)
        if (obj?.get("type")?.asString != "SyncDocumentCommand") null
        else {
            obj.get("content")
                ?.takeIf { !it.isJsonNull }
                ?.asString
                ?.let { content ->
                    SyncDocumentReply(
                        content,
                        obj.get("documentRevision")?.takeIf { !it.isJsonNull }?.asLong,
                    )
                }
        }
    } catch (_: Exception) {
        null
    }

/**
 * Reads one top-level numeric member without materialising the others, so a
 * multi-MB `content` string is skipped instead of being decoded into a String.
 * Returns null when the member is absent, null, not a number, or the JSON is malformed.
 */
internal fun readTopLevelLong(rawJson: String, memberName: String, gson: Gson): Long? =
    try {
        gson.newJsonReader(StringReader(rawJson)).use { reader ->
            reader.beginObject()
            while (reader.hasNext()) {
                if (reader.nextName() != memberName) {
                    reader.skipValue()
                    continue
                }
                return@use if (reader.peek() == JsonToken.NUMBER) reader.nextLong() else null
            }
            null
        }
    } catch (_: Exception) {
        null
    }

private fun JsonElement.asStringOrNull(): String? = takeIf { !it.isJsonNull }?.asString

internal fun parseSyncDocumentContent(raw: String, gson: Gson): String? =
    parseSyncDocumentReply(raw, gson)?.content

internal fun pageFlushContent(
    capturedSync: String?,
    reply: DocumentFlushedReply,
    cleanReplyKeepsCapturedSync: Boolean,
): String? =
    when (reply.status) {
        "flushed" -> reply.content
        "unavailable" -> capturedSync
        "clean" -> capturedSync.takeIf { cleanReplyKeepsCapturedSync }
        else -> null
    }

internal fun pageFlushRevisionMatches(expected: Long, actual: Long?): Boolean =
    (actual ?: 0L) == expected
