package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.text.StringUtil
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.concurrent.ConcurrentHashMap

/**
 * Supervises the out-of-process modeler core and bridges it to the IntelliJ host
 * over bidirectional, newline-delimited JSON-RPC (see the TS `Rpc` peer).
 *
 * The architectural point of the spike lives here: this class is *pure
 * transport plus port adapters*. It owns no modeling logic — the unmodified
 * TypeScript core (`BpmnModelerService` et al.) running inside `node` does. Host
 * responsibilities are only:
 *  - forward webview messages into the core (`webview/message`);
 *  - push core→webview messages into the right JCEF browser (`editor/postMessage`);
 *  - satisfy the document port (`document/write` / `document/save`) against the
 *    real IntelliJ `Document`.
 *
 * A single application-level process serves every open editor; sessions are
 * keyed by editor id so messages route correctly.
 *
 * The `node` runtime is resolved from `PATH` (override with `-Dmiranum.node=…`
 * or `MIRANUM_NODE`). Shipping a bundled runtime is the productionization step
 * the spike deliberately leaves open.
 */
@Service(Service.Level.APP)
class CoreProcess : Disposable {
    private val log = Logger.getInstance(CoreProcess::class.java)
    private val gson = Gson()

    private val sessions = ConcurrentHashMap<String, CoreSession>()

    // Diff panes route by `paneUri`, not editor id: a diff has two browsers that
    // are not `CoreSession`s. The sink pushes a core→webview JSON payload into
    // the matching JCEF browser; the index lets `disposeDiff` drop both panes.
    private val diffPanes = ConcurrentHashMap<String, (String) -> Unit>()
    private val diffPaneUris = ConcurrentHashMap<String, List<String>>()

    private val writeLock = Any()
    private var process: Process? = null
    private var writer: BufferedWriter? = null

    @Synchronized
    private fun ensureStarted() {
        if (process?.isAlive == true) return

        val script = extractServerScript()
        val nodePath =
            System.getProperty("miranum.node") ?: System.getenv("MIRANUM_NODE") ?: "node"

        try {
            val started =
                ProcessBuilder(nodePath, script.toString())
                    .redirectErrorStream(false)
                    .start()
            process = started
            writer = BufferedWriter(OutputStreamWriter(started.outputStream, StandardCharsets.UTF_8))
            pump(started.inputStream) { onLine(it) }
            // stderr is the core's diagnostic channel (stdout is reserved for RPC).
            pump(started.errorStream) { log.info("[core stderr] $it") }
            log.info("Miranum modeler core started: $nodePath $script")
        } catch (e: Exception) {
            // Most likely: `node` is not on PATH. Surface clearly; the editor will
            // stay blank because no BpmnFileQuery ever arrives.
            log.error("Failed to start the modeler core via '$nodePath'. Is Node.js on PATH?", e)
        }
    }

    /** Registers an editor and tells the core to open it (seeding the document mirror). */
    fun registerSession(session: CoreSession) {
        ensureStarted()
        sessions[session.editorId] = session
        val content =
            ReadAction.compute<String, RuntimeException> {
                FileDocumentManager.getInstance().getDocument(session.file)?.text.orEmpty()
            }
        notify(
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
                "workspaceRoot" to (session.project.basePath ?: session.file.parent?.path),
                "content" to content,
            ),
        )
    }

    /** Forwards one raw webview message (already JSON) to the core untouched. */
    fun forwardWebviewMessage(editorId: String, rawMessage: String) {
        val message =
            try {
                JsonParser.parseString(rawMessage)
            } catch (e: Exception) {
                log.warn("Discarding malformed webview message: $rawMessage", e)
                return
            }
        notify("webview/message", linkedMapOf("editorId" to editorId, "message" to message))
    }

    fun disposeSession(editorId: String) {
        sessions.remove(editorId)
        notify("session/dispose", linkedMapOf("editorId" to editorId))
    }

    /**
     * Starts a host-originated diff session in the core. Both sides are known up
     * front (IntelliJ resolves the diff with HEAD and working-tree contents in
     * hand), so the core arms a fully-paired [DiffSession] immediately — no
     * VS Code-style out-of-order pane resolution. `postToBefore`/`postToAfter`
     * sink core→webview messages into each side's JCEF browser.
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
        ensureStarted()
        diffPanes[beforeUri] = postToBefore
        diffPanes[afterUri] = postToAfter
        diffPaneUris[diffId] = listOf(beforeUri, afterUri)
        notify(
            "diff/open",
            linkedMapOf(
                "diffId" to diffId,
                "origin" to origin,
                "before" to linkedMapOf("uri" to beforeUri, "content" to beforeContent),
                "after" to linkedMapOf("uri" to afterUri, "content" to afterContent),
            ),
        )
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
        notify("diff/webviewMessage", linkedMapOf("paneUri" to paneUri, "message" to message))
    }

    fun disposeDiff(diffId: String) {
        diffPaneUris.remove(diffId)?.forEach { diffPanes.remove(it) }
        notify("diff/dispose", linkedMapOf("diffId" to diffId))
    }

    /** Dispatches one line received from the core's stdout. */
    private fun onLine(line: String) {
        val message =
            try {
                gson.fromJson(line, JsonObject::class.java)
            } catch (e: Exception) {
                log.warn("Discarding malformed core message: $line", e)
                return
            }
        // The host issues no requests to the core, so a frame without `method`
        // (i.e. a response) is never expected and is ignored.
        val method = message.get("method")?.takeIf { !it.isJsonNull }?.asString ?: return
        val params = message.getAsJsonObject("params")
        val id = message.get("id")?.takeIf { !it.isJsonNull }?.asInt

        when (method) {
            "editor/postMessage" -> {
                val editorId = params.get("editorId").asString
                // `message` is a JSON object; re-serialise it as the postMessage payload.
                val payload = gson.toJson(params.get("message"))
                sessions[editorId]?.postToWebview(payload)
            }
            "diff/postMessage" -> {
                val paneUri = params.get("paneUri").asString
                val payload = gson.toJson(params.get("message"))
                diffPanes[paneUri]?.invoke(payload)
            }
            "document/write" -> handleWrite(params, id)
            "document/save" -> handleSave(params, id)
            "statusBar/showEngineVersion" ->
                log.info(
                    "[core] engine ${params.get("platform")?.asString} " +
                        "${params.get("version")?.asString}",
                )
            "notifier/log" -> {
                val text = "[webview] ${params.get("message")?.asString.orEmpty()}"
                when (params.get("level")?.asString) {
                    "error" -> log.warn(text)
                    else -> log.info(text)
                }
            }
            else -> log.debug("Unhandled core method: $method")
        }
    }

    /**
     * Writes core-supplied XML into the in-memory Document on the EDT, then replies
     * with whether the content actually changed (the `DocumentPort.write` contract).
     * IntelliJ Documents require `\n`; webview XML may carry `\r\n`.
     */
    private fun handleWrite(params: JsonObject, id: Int?) {
        val editorId = params.get("editorId").asString
        val content = StringUtil.convertLineSeparators(params.get("content").asString)
        val session = sessions[editorId]
        if (session == null) {
            id?.let { reply(it, mapOf("changed" to false)) }
            return
        }
        ApplicationManager.getApplication().invokeLater {
            var changed = false
            if (!session.project.isDisposed) {
                val document = FileDocumentManager.getInstance().getDocument(session.file)
                if (document != null && document.text != content) {
                    WriteCommandAction.runWriteCommandAction(session.project) {
                        document.setText(content)
                    }
                    changed = true
                }
            }
            id?.let { reply(it, mapOf("changed" to changed)) }
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
            id?.let { reply(it, mapOf("saved" to true)) }
        }
    }

    private fun notify(method: String, params: Any?) =
        send(linkedMapOf("method" to method, "params" to params))

    private fun reply(id: Int, result: Any?) = send(linkedMapOf("id" to id, "result" to result))

    private fun send(frame: Map<String, Any?>) {
        val line = gson.toJson(frame)
        synchronized(writeLock) {
            val target = writer ?: return
            try {
                target.write(line)
                target.write("\n")
                target.flush()
            } catch (e: Exception) {
                log.warn("Failed to write to core stdin", e)
            }
        }
    }

    private fun extractServerScript(): Path {
        val stream =
            javaClass.getResourceAsStream("/core/server.js")
                ?: error("Bundled modeler core (/core/server.js) not found on the classpath")
        val temp = Files.createTempFile("miranum-modeler-core", ".js")
        temp.toFile().deleteOnExit()
        stream.use { Files.copy(it, temp, StandardCopyOption.REPLACE_EXISTING) }
        return temp
    }

    private fun pump(input: InputStream, onLine: (String) -> Unit) {
        val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))
        Thread({
            reader.useLines { lines -> lines.forEach(onLine) }
        }, "miranum-core-reader").apply {
            isDaemon = true
            start()
        }
    }

    override fun dispose() {
        synchronized(writeLock) {
            runCatching { writer?.close() }
            writer = null
        }
        process?.destroy()
        process = null
        sessions.clear()
    }
}
