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
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.concurrency.AppExecutorUtil
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
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
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Supervises the out-of-process modeler core and bridges it to the IntelliJ host
 * over bidirectional, newline-delimited JSON-RPC (see the TS `Rpc` peer).
 *
 * This class is *pure transport plus port adapters* — it owns no modeling logic.
 * The unmodified TypeScript core (`BpmnModelerService` et al.), shipped as a
 * Node-free Bun binary, runs in the subprocess. Host responsibilities are only:
 *  - forward webview messages into the core (`webview/message`);
 *  - push core→webview messages into the right JCEF browser (`editor/postMessage`);
 *  - satisfy the document port (`document/write` / `document/save`) against the
 *    real IntelliJ `Document`;
 *  - render the core's `NotifierPort` / `StatusBarPort` as IntelliJ UI, and its
 *    `PickerPort` (`picker/show`) as a native `JBPopup` chooser.
 *
 * **Topology.** A project-level service: one supervised bridge per project
 * window, lazily spawned on the first editor and torn down with the project.
 * Sessions are keyed by editor id so messages route correctly when several
 * `.bpmn` files are open at once.
 *
 * **Robustness.** The bridge is spawned from a bundled, self-contained binary
 * (no system Node). A crash is detected via process exit and the bridge is
 * respawned with backoff; every live session is re-registered from the
 * authoritative IntelliJ `Document`, and a `GetBpmnFileCommand` is replayed so
 * open editors re-render. On dispose (project close / IDE exit) the process is
 * destroyed; because the bridge exits on stdin EOF, killing the JVM never
 * orphans it — the shutdown hook + `destroyForcibly` are belt-and-suspenders.
 */
@Service(Service.Level.PROJECT)
class CoreProcess(private val project: Project) : Disposable {
    private val log = Logger.getInstance(CoreProcess::class.java)
    private val gson = Gson()
    private val notifications by lazy { HostNotifications(project) }
    private val secretStore by lazy { IntellijSecretStore() }
    private val deploymentState by lazy { IntellijDeploymentState.getInstance(project) }

    // Owns the inline-script editor tabs. Edits stream back as `script/didChange`;
    // a user closing a tab reports `script/didClose`. Parented to this service so
    // its listeners die with the project. The core addresses scripts by opaque id.
    private val scriptEditors by lazy {
        ScriptEditorManager(
            project,
            this,
            onChange = { scriptId, content ->
                notify("script/didChange", linkedMapOf("scriptId" to scriptId, "content" to content))
            },
            onUserClose = { scriptId ->
                notify("script/didClose", linkedMapOf("scriptId" to scriptId))
            },
        )
    }

    private val sessions = ConcurrentHashMap<String, CoreSession>()

    // The deployment tool window's core→webview sink. One tool window per project,
    // so a later register replaces the previous sink (null when closed).
    @Volatile
    private var deploymentSink: ((String) -> Unit)? = null

    // Diff panes route by `paneUri`, not editor id: a diff has two browsers and
    // is host-originated. `diffPanes` maps each pane's URI to its core→webview
    // sink; `diffPaneUris` lets `disposeDiff` drop both panes of a diff at once.
    private val diffPanes = ConcurrentHashMap<String, (String) -> Unit>()
    private val diffPaneUris = ConcurrentHashMap<String, List<String>>()

    private val writeLock = Any()

    // Read unsynchronized from pushSettings/reregisterLiveSessions/dispose and the
    // shutdown hook, so its writes must publish safely across threads.
    @Volatile
    private var process: Process? = null
    private var writer: BufferedWriter? = null

    private val disposed = AtomicBoolean(false)
    private val restartAttempts = AtomicInteger(0)

    @Volatile
    private var lastSpawnAt = 0L

    @Volatile
    private var cachedBinary: Path? = null
    private var shutdownHook: Thread? = null

    // Outbound (host→core) frames are drained by a single writer thread so the
    // EDT / JCEF threads never block on the bridge's stdin. The deque also enables
    // coalescing: a flood of document syncs collapses to its latest frame.
    private data class OutFrame(val line: String, val coalesceKey: String?)

    private val outbound = ArrayDeque<OutFrame>()
    private val outboundMonitor = Object()
    private var writerThread: Thread? = null

    init {
        // Keep the core's active-editor pointer in sync with the focused tab so
        // operations that target "the active editor" address the right session
        // when several `.bpmn` files are open. Parented to this service, so the
        // subscription dies with the project.
        project.messageBus.connect(this).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    event.newFile?.url?.let { setActiveEditor(it) }
                }
            },
        )
    }

    // ── lifecycle ────────────────────────────────────────────────────────────

    @Synchronized
    private fun ensureStarted() {
        if (process?.isAlive == true) return
        spawn()
    }

    private fun spawn() {
        val binary =
            try {
                resolveBridgeBinary()
            } catch (e: Exception) {
                log.error("Failed to resolve the bundled modeler bridge binary", e)
                notifications.showError("Could not start the BPMN modeler engine: ${e.message}")
                return
            }
        try {
            val started = ProcessBuilder(binary.toString()).redirectErrorStream(false).start()
            synchronized(writeLock) {
                process = started
                writer = BufferedWriter(OutputStreamWriter(started.outputStream, StandardCharsets.UTF_8))
            }
            lastSpawnAt = System.currentTimeMillis()
            pump(started.inputStream) { onLine(it) }
            // stderr is the core's diagnostic channel (stdout is reserved for RPC).
            pump(started.errorStream) { log.info("[bridge stderr] $it") }
            started.onExit().thenAccept { handleExit(started) }
            ensureWriterThread()
            ensureShutdownHook()
            // Seed the deployment-state mirror up front so the bridge's synchronous
            // getters are correct; re-runs on every (re)spawn, rebuilding the mirror.
            sendDeploymentSeed()
            log.info("Miragon modeler bridge started: $binary")
        } catch (e: Exception) {
            log.error("Failed to start the modeler bridge", e)
            notifications.showError("Could not start the BPMN modeler engine. See idea.log.")
        }
    }

    /**
     * Reacts to the bridge process dying. Distinguishes a stable run that
     * crashed (reset the attempt counter) from a rapid restart loop (give up
     * after [MAX_RESTARTS]); on a survivable crash, respawns with linear backoff
     * and recovers every open editor.
     */
    private fun handleExit(dead: Process) {
        if (disposed.get()) return
        synchronized(writeLock) {
            if (process !== dead) return // already replaced by a newer spawn
            writer = null
        }

        if (System.currentTimeMillis() - lastSpawnAt > STABLE_RUN_MS) {
            restartAttempts.set(0)
        }
        val attempt = restartAttempts.incrementAndGet()
        if (attempt > MAX_RESTARTS) {
            log.error("Modeler bridge exited $attempt times in quick succession; giving up.")
            notifications.showError(
                "The BPMN modeler engine crashed repeatedly and will not be restarted. " +
                    "Reopen the file or restart the IDE. See idea.log.",
            )
            return
        }
        log.warn(
            "Modeler bridge exited (code ${runCatching { dead.exitValue() }.getOrNull()}); " +
                "restart attempt $attempt/$MAX_RESTARTS",
        )

        // Respawn off this thread, not via Thread.sleep: handleExit runs on the
        // Process.onExit() CompletableFuture callback (ForkJoinPool.commonPool),
        // and blocking it for the backoff would hold a shared platform pool
        // thread for up to seconds. Re-check disposed/liveness at fire time.
        AppExecutorUtil.getAppScheduledExecutorService().schedule(
            {
                if (disposed.get()) return@schedule
                synchronized(this) { if (process?.isAlive != true) spawn() }
                reregisterLiveSessions()
            },
            RESTART_BACKOFF_MS * attempt,
            TimeUnit.MILLISECONDS,
        )
    }

    /**
     * Re-seeds every open session into a freshly spawned bridge (the document
     * mirror is rebuilt from the live IntelliJ `Document`, the authoritative
     * source) and replays `GetBpmnFileCommand` so the still-alive JCEF page
     * re-renders without a reload.
     */
    private fun reregisterLiveSessions() {
        if (process?.isAlive != true) return
        sessions.values.forEach { session ->
            sendRegister(session)
            forwardWebviewMessage(session.editorId, GET_BPMN_FILE_COMMAND)
        }
    }

    // ── host → core ──────────────────────────────────────────────────────────

    /** Registers an editor and tells the core to open it (seeding the document mirror). */
    fun registerSession(session: CoreSession) {
        ensureStarted()
        sessions[session.editorId] = session
        sendRegister(session)
    }

    private fun sendRegister(session: CoreSession) {
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
                "workspaceRoot" to (project.basePath ?: session.file.parent?.path),
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
        if (process?.isAlive != true) return
        notify("settings/didChange", linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap()))
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
        notify("webview/message", linkedMapOf("editorId" to editorId, "message" to parsed), coalesceKey)
    }

    /**
     * Forwards a document change to the core so external edits (git revert/
     * checkout, the plain-text tab, another tool) re-render the diagram. The host
     * stays dumb: it reports *every* change, including the echo of its own
     * `document/write`. The bridge tells the two apart — re-rendering our own
     * write would loop, so it is filtered there, not here.
     */
    fun notifyDocumentChanged(editorId: String, content: String) {
        if (!sessions.containsKey(editorId)) return
        notify("document/didChange", linkedMapOf("editorId" to editorId, "content" to content))
    }

    /** Tells the core which open editor is focused (drives its active-editor pointer). */
    private fun setActiveEditor(editorId: String) {
        if (!sessions.containsKey(editorId)) return
        notify("session/setActive", linkedMapOf("editorId" to editorId))
    }

    fun disposeSession(editorId: String) {
        sessions.remove(editorId)
        notify("session/dispose", linkedMapOf("editorId" to editorId))
    }

    // ── deployment tool window ─────────────────────────────────────────────────

    /**
     * Registers the deployment tool window's core→webview sink and (re-)seeds the
     * deployment-state mirror. One tool window per project, so a later register
     * replaces the previous sink.
     */
    fun registerDeploymentWindow(sink: (String) -> Unit) {
        ensureStarted()
        deploymentSink = sink
        sendDeploymentSeed()
    }

    /** Drops the deployment sink and marks the panel closed (stops default refreshes). */
    fun unregisterDeploymentWindow() {
        deploymentSink = null
        notify("deployment/open", linkedMapOf("open" to false))
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
        notify("deployment/webviewMessage", linkedMapOf("message" to parsed))
    }

    /** Tells the core whether the deployment panel is visible (drives form-default refresh). */
    fun setDeploymentOpen(open: Boolean) {
        notify("deployment/open", linkedMapOf("open" to open))
    }

    private fun sendDeploymentSeed() {
        if (process?.isAlive != true) return
        notify("deploymentState/seed", linkedMapOf("state" to deploymentState.snapshotMap()))
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

    /**
     * Tears a diff down: drops both panes' sinks (so a stray late reply can't
     * resurrect a closed pane) and tells the core to retire the session. Called
     * on tab close and, with an immediate re-`openDiff`, on swap.
     */
    fun disposeDiff(diffId: String) {
        diffPaneUris.remove(diffId)?.forEach { diffPanes.remove(it) }
        notify("diff/dispose", linkedMapOf("diffId" to diffId))
    }

    // ── core → host ──────────────────────────────────────────────────────────

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

        // A malformed/unexpected frame (missing member, wrong type, a throwing
        // handler such as a failing PasswordSafe call) must not escape: this runs
        // on the daemon reader thread, and an escaped exception would kill the
        // pump — core→host traffic stops forever, and once the stdout pipe fills
        // the bridge wedges without exiting, so the crash supervisor never fires.
        // If the frame was a request, also answer it: an unanswered request would
        // otherwise leak the core's awaiting promise.
        try {
            dispatch(method, params, id)
        } catch (e: Exception) {
            log.warn("Failed to handle core message ($method): $line", e)
            id?.let { replyError(it, e.message ?: "host handler failed") }
        }
    }

    /** Routes one decoded core frame to its handler. See [onLine] for failure handling. */
    private fun dispatch(method: String, params: JsonObject, id: Int?) {
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
            "deployment/postMessage" -> {
                val payload = gson.toJson(params.get("message"))
                deploymentSink?.invoke(payload)
            }
            // PropertiesComponent writes are thread-safe and run on the reader
            // thread here (same as the secretStore handlers below).
            "deploymentState/saveAuthType" ->
                deploymentState.saveAuthType(params.get("authType").asString)
            "deploymentState/saveOAuth2Config" ->
                deploymentState.saveOAuth2Config(
                    params.get("tokenEndpoint").asString,
                    params.get("audience").asString,
                )
            "deploymentState/save" ->
                deploymentState.save(
                    params.get("endpoint").asString,
                    params.get("tenantId").asString,
                )
            // Inline-script editor: the host is a dumb surface keyed by scriptId.
            // `completion` is optional and carries the kind-scoped catalog the
            // bridge already resolved; fromJson tolerates a missing/null member.
            "script/open" ->
                scriptEditors.openScript(
                    params.get("scriptId").asString,
                    params.get("fileName").asString,
                    params.get("content").asString,
                    gson.fromJson(params.get("completion"), ScriptCompletionModel::class.java),
                )
            "script/close" -> scriptEditors.closeScript(params.get("scriptId").asString)
            "document/write" -> handleWrite(params, id)
            "document/save" -> handleSave(params, id)
            "picker/show" -> handlePick(params, id)
            "clipboard/read" -> handleClipboardRead(id)
            "clipboard/write" -> handleClipboardWrite(params)
            "statusBar/showEngineVersion" -> {
                val label = if (params.get("platform")?.asString == "c7") "Camunda 7" else "Camunda 8"
                EngineStatusBarWidget.updateEngine(project, "$label ${params.get("version")?.asString}")
            }
            "statusBar/hideEngineVersion", "statusBar/disposeEngineVersion" ->
                EngineStatusBarWidget.updateEngine(project, null)
            "statusBar/templatesReady" ->
                EngineStatusBarWidget.updateTemplateCount(project, params.get("count")?.asInt ?: 0)
            "statusBar/templatesHide" -> EngineStatusBarWidget.updateTemplateCount(project, null)
            "statusBar/templatesLoading" -> Unit // transient; the count frame follows
            "notifier/showInfo" -> notifications.showInfo(params.get("message").asString)
            "notifier/showError" -> notifications.showError(params.get("message").asString)
            "notifier/notifyError" ->
                notifications.notifyError(params.get("context").asString, params.get("message").asString)
            "notifier/openConsole" -> notifications.openLoggingConsole()
            "notifier/openDocument" -> notifications.openDocument(params.get("path").asString)
            "notifier/log" ->
                notifications.log(params.get("level")?.asString, params.get("message")?.asString.orEmpty())
            "notifier/progressStart", "notifier/progressEnd" ->
                log.debug("$method: ${params.get("title")?.asString}")
            // PasswordSafe get/set block and must stay off the EDT; onLine runs on
            // the background reader thread, so calling them inline here is safe.
            "secretStore/saveBasicAuth" -> {
                secretStore.saveBasicAuth(params.get("username").asString, params.get("password").asString)
                id?.let { reply(it, null) }
            }
            "secretStore/getBasicAuth" -> {
                val creds = secretStore.getBasicAuth()
                val username = creds?.userName
                val password = creds?.getPasswordAsString()
                id?.let {
                    reply(
                        it,
                        if (username != null && password != null) {
                            mapOf("username" to username, "password" to password)
                        } else {
                            null
                        },
                    )
                }
            }
            "secretStore/saveOAuth2" -> {
                secretStore.saveOAuth2(params.get("clientId").asString, params.get("clientSecret").asString)
                id?.let { reply(it, null) }
            }
            "secretStore/getOAuth2" -> {
                val creds = secretStore.getOAuth2()
                val clientId = creds?.userName
                val clientSecret = creds?.getPasswordAsString()
                id?.let {
                    reply(
                        it,
                        if (clientId != null && clientSecret != null) {
                            mapOf("clientId" to clientId, "clientSecret" to clientSecret)
                        } else {
                            null
                        },
                    )
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

    /**
     * Shows a native list popup for the core's `PickerPort` and replies with the
     * chosen item indices, or `null` on dismissal. The host renders only the
     * chooser; the cancel-vs-throw convention is applied core-side.
     */
    private fun handlePick(params: JsonObject, id: Int?) {
        // A picker prompt is always a request expecting a reply; a missing id
        // would mean nothing to answer, so there is nothing to do.
        if (id == null) return
        val title = params.get("title")?.takeIf { !it.isJsonNull }?.asString
        val placeholder = params.get("placeholder")?.takeIf { !it.isJsonNull }?.asString.orEmpty()
        val canPickMany = params.get("canPickMany")?.takeIf { !it.isJsonNull }?.asBoolean ?: false
        val items =
            params.getAsJsonArray("items").mapIndexed { index, element ->
                val obj = element.asJsonObject
                HostPicker.PickItem(
                    index,
                    obj.get("label").asString,
                    obj.get("description")?.takeIf { !it.isJsonNull }?.asString,
                )
            }
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) {
                reply(id, mapOf("selected" to null))
                return@invokeLater
            }
            HostPicker.show(project, title, placeholder, canPickMany, items) { selected ->
                reply(id, mapOf("selected" to selected))
            }
        }
    }

    /**
     * Reads the system clipboard for the webview's copy/paste mediator. The
     * sandboxed JCEF page can't touch the clipboard and the core is a separate
     * process, so the host reads on their behalf and replies with the text.
     * `runCatching` → `""` keeps a denied/empty/non-text clipboard from breaking
     * paste — an empty string is a valid "nothing to paste" answer.
     */
    private fun handleClipboardRead(id: Int?) {
        ApplicationManager.getApplication().invokeLater {
            val text =
                runCatching {
                    CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
                }.getOrNull().orEmpty()
            id?.let { reply(it, mapOf("text" to text)) }
        }
    }

    /** Writes the webview's copied text onto the system clipboard (fire-and-forget). */
    private fun handleClipboardWrite(params: JsonObject) {
        val text = params.get("text")?.takeIf { !it.isJsonNull }?.asString.orEmpty()
        ApplicationManager.getApplication().invokeLater {
            CopyPasteManager.getInstance().setContents(StringSelection(text))
        }
    }

    // ── outbound transport (single writer thread + coalescing backpressure) ───

    private fun notify(method: String, params: Any?, coalesceKey: String? = null) =
        enqueue(gson.toJson(linkedMapOf("method" to method, "params" to params)), coalesceKey)

    private fun reply(id: Int, result: Any?) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "result" to result)), null)

    // The bridge's `rpc.ts` turns `{id, error}` into a rejected promise, so a
    // handler that throws still settles the core's awaiting request instead of
    // leaking it.
    private fun replyError(id: Int, message: String) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "error" to message)), null)

    private fun enqueue(line: String, coalesceKey: String?) {
        synchronized(outboundMonitor) {
            if (coalesceKey != null) {
                val iterator = outbound.iterator()
                while (iterator.hasNext()) {
                    if (iterator.next().coalesceKey == coalesceKey) iterator.remove()
                }
            }
            if (outbound.size >= OUTBOUND_CAPACITY) {
                outbound.removeFirst()
                log.warn("Outbound bridge queue full ($OUTBOUND_CAPACITY); dropped oldest frame (backpressure)")
            }
            outbound.addLast(OutFrame(line, coalesceKey))
            outboundMonitor.notifyAll()
        }
    }

    private fun ensureWriterThread() {
        if (writerThread != null) return
        writerThread =
            Thread({ writerLoop() }, "modeler-bridge-writer").apply {
                isDaemon = true
                start()
            }
    }

    private fun writerLoop() {
        while (!disposed.get()) {
            val frame =
                synchronized(outboundMonitor) {
                    while (outbound.isEmpty() && !disposed.get()) outboundMonitor.wait()
                    if (disposed.get()) return else outbound.removeFirst()
                }
            val target = synchronized(writeLock) { writer }
            if (target == null) {
                // No live bridge stdin (restart window). Drop rather than spin:
                // sessions are re-seeded from the authoritative Document on restart.
                log.debug("No bridge writer; dropped a queued frame during restart")
                continue
            }
            try {
                synchronized(writeLock) {
                    target.write(frame.line)
                    target.write("\n")
                    target.flush()
                }
            } catch (e: Exception) {
                log.warn("Failed to write to bridge stdin", e)
            }
        }
    }

    // ── binary resolution + plumbing ──────────────────────────────────────────

    /**
     * Returns the path to a runnable bridge binary: a dev override if set, else
     * the bundled per-platform binary extracted from the classpath, made
     * executable, and cached for the service's lifetime.
     */
    private fun resolveBridgeBinary(): Path {
        (System.getProperty("miragon.bridge") ?: System.getenv("MIRAGON_BRIDGE"))?.let {
            return Path.of(it)
        }
        cachedBinary?.let { return it }

        val platform = platformDir()
        val resource = "/bin/$platform/$BRIDGE_BINARY_NAME"
        val stream =
            javaClass.getResourceAsStream(resource)
                ?: error(
                    "No bundled modeler bridge for platform '$platform' ($resource). " +
                        "Build it with `corepack yarn workspace @miragon/bpmn-modeler-bridge compile`.",
                )
        val temp = Files.createTempFile("modeler-bridge", "")
        stream.use { Files.copy(it, temp, StandardCopyOption.REPLACE_EXISTING) }
        temp.toFile().setExecutable(true, true)
        temp.toFile().deleteOnExit()
        cachedBinary = temp
        return temp
    }

    private fun platformDir(): String {
        val os = System.getProperty("os.name").lowercase()
        val arch = System.getProperty("os.arch").lowercase()
        val osPart =
            when {
                os.contains("mac") || os.contains("darwin") -> "darwin"
                os.contains("win") -> "windows"
                else -> "linux"
            }
        val archPart = if (arch.contains("aarch64") || arch.contains("arm")) "arm64" else "x64"
        return "$osPart-$archPart"
    }

    private fun ensureShutdownHook() {
        if (shutdownHook != null) return
        // On JVM exit the service's own dispose() may not run, so this hook is the
        // only teardown. Mark `disposed` first so the process-exit handler treats
        // the kill as intentional shutdown (not a crash to restart from), then
        // close stdin so the bridge exits cleanly on EOF; destroyForcibly is the
        // bounded fallback for a bridge that ignores the EOF.
        val hook =
            Thread {
                disposed.set(true)
                synchronized(writeLock) { runCatching { writer?.close() } }
                val dying = process
                if (dying != null && !dying.waitFor(500, TimeUnit.MILLISECONDS)) {
                    runCatching { dying.destroyForcibly() }
                }
            }
        shutdownHook = hook
        runCatching { Runtime.getRuntime().addShutdownHook(hook) }
    }

    private fun pump(input: InputStream, onLine: (String) -> Unit) {
        val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))
        Thread({
            reader.useLines { lines -> lines.forEach(onLine) }
        }, "modeler-bridge-reader").apply {
            isDaemon = true
            start()
        }
    }

    override fun dispose() {
        disposed.set(true)
        synchronized(outboundMonitor) { outboundMonitor.notifyAll() }
        shutdownHook?.let { runCatching { Runtime.getRuntime().removeShutdownHook(it) } }
        shutdownHook = null

        synchronized(writeLock) {
            runCatching { writer?.close() }
            writer = null
        }
        val dying = process
        process = null
        if (dying != null) {
            // Closing stdin makes the bridge exit on EOF; give it a moment, then force.
            dying.destroy()
            if (!dying.waitFor(2, TimeUnit.SECONDS)) dying.destroyForcibly()
        }
        sessions.clear()
        diffPanes.clear()
        diffPaneUris.clear()
        deploymentSink = null
    }

    private companion object {
        const val OUTBOUND_CAPACITY = 512
        const val MAX_RESTARTS = 5
        const val RESTART_BACKOFF_MS = 500L
        const val STABLE_RUN_MS = 15_000L
        const val BRIDGE_BINARY_NAME = "modeler-bridge"
        const val GET_BPMN_FILE_COMMAND = "{\"type\":\"GetBpmnFileCommand\"}"
    }
}
