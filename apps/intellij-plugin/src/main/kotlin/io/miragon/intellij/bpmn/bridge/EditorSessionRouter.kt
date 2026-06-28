package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.text.StringUtil
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.ModelerSettingsStore
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes the BPMN-editor feature: open-session registration, document-port
 * fulfilment (`document/write` / `document/save`) against the real IntelliJ
 * `Document`, and core→webview message delivery. Sessions are keyed by editor id
 * so messages reach the right JCEF browser when several `.bpmn` files are open.
 */
internal class EditorSessionRouter(private val deps: BridgeDeps) {
    private val log = Logger.getInstance(EditorSessionRouter::class.java)

    private val sessions = ConcurrentHashMap<String, CoreSession>()

    // Per-editor causation token bridging [handleWrite] to [notifyDocumentChanged]:
    // a `document/write` records its revision here right before mutating the
    // Document, so the synchronous `DocumentListener` echo it triggers can stamp
    // the outgoing `document/didChange` with `causedBy`. The bridge then drops its
    // own write by causation instead of comparing content.
    private val pendingCausation = ConcurrentHashMap<String, Long>()

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
            ReadAction.compute<String, RuntimeException> {
                FileDocumentManager.getInstance().getDocument(session.file)?.text.orEmpty()
            }
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
                "settings" to ModelerSettingsStore.getInstance().snapshotMap(),
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
        deps.channel.notify("settings/didChange", linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap()))
    }

    /** Forwards one raw webview message (already JSON) to the core untouched. */
    fun forwardWebviewMessage(editorId: String, rawMessage: String) {
        val parsed =
            try {
                JsonParser.parseString(rawMessage)
            } catch (e: Exception) {
                log.warn("Discarding malformed webview message: $rawMessage", e)
                return
            }
        val type = (parsed as? JsonObject)?.get("type")?.takeIf { !it.isJsonNull }?.asString
        // Document syncs fire once per diagram edit and supersede each other —
        // only the latest XML matters for write-back — so collapse queued ones.
        val coalesceKey = if (type == "SyncDocumentCommand") "sync:$editorId" else null
        deps.channel.notify("webview/message", linkedMapOf("editorId" to editorId, "message" to parsed), coalesceKey)
    }

    /**
     * Forwards a document change to the core so external edits (git revert/
     * checkout, the plain-text tab, another tool) re-render the diagram. The host
     * stays dumb otherwise, but it does tag the echo of its own `document/write`:
     * if [handleWrite] left a pending causation token for this editor, the change
     * carries it as `causedBy` so the bridge can drop its own write by explicit
     * causation. A genuine external edit has no pending token and omits `causedBy`.
     */
    fun notifyDocumentChanged(editorId: String, content: String) {
        if (!sessions.containsKey(editorId)) return
        val params = linkedMapOf<String, Any>("editorId" to editorId, "content" to content)
        pendingCausation.remove(editorId)?.let { params["causedBy"] = it }
        deps.channel.notify("document/didChange", params)
    }

    /** Tells the core which open editor is focused (drives its active-editor pointer). */
    fun setActiveEditor(editorId: String) {
        if (!sessions.containsKey(editorId)) return
        deps.channel.notify("session/setActive", linkedMapOf("editorId" to editorId))
    }

    fun disposeSession(editorId: String) {
        sessions.remove(editorId)
        pendingCausation.remove(editorId)
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

    fun clear() = sessions.clear()

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
                if (document != null && document.text != content) {
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

    private companion object {
        const val GET_BPMN_FILE_COMMAND = "{\"type\":\"GetBpmnFileCommand\"}"
    }
}
