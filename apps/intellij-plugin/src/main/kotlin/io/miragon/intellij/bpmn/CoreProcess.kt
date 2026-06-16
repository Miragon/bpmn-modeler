package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import io.miragon.intellij.bpmn.bridge.BridgeBinaryResolver
import io.miragon.intellij.bpmn.bridge.BridgeDeps
import io.miragon.intellij.bpmn.bridge.DeploymentRouter
import io.miragon.intellij.bpmn.bridge.DiffRouter
import io.miragon.intellij.bpmn.bridge.EditorSessionRouter
import io.miragon.intellij.bpmn.bridge.HostUiRouter
import io.miragon.intellij.bpmn.bridge.ProcessSupervisor
import io.miragon.intellij.bpmn.bridge.RpcChannel
import io.miragon.intellij.bpmn.bridge.RpcHandlerRegistry
import io.miragon.intellij.bpmn.bridge.ScriptRouter
import io.miragon.intellij.bpmn.bridge.SecretStoreRouter

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
 * **Role.** This service is the composition root + façade. It wires the bridge
 * collaborators in `io.miragon.intellij.bpmn.bridge` — the [RpcChannel]
 * transport, the [ProcessSupervisor], and the per-feature routers populating one
 * [RpcHandlerRegistry] — and exposes the host-facing API as one-line delegations.
 * The decomposition mirrors the TS-side `bridge.ts` split into `composition/`.
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
    // Lazy so the happy path never constructs the UI surface; shared between the
    // supervisor (spawn-failure errors) and the host-UI router.
    private val notifications = lazy { HostNotifications(project) }

    private val handlers = RpcHandlerRegistry()
    private val channel = RpcChannel { method, params, id -> handlers.dispatch(method, params, id) }
    private val supervisor: ProcessSupervisor =
        ProcessSupervisor(
            channel = channel,
            binaryResolver = BridgeBinaryResolver(),
            notifications = { notifications.value },
            // Declared after the supervisor; safe because both lambdas only fire
            // post-construction, on the first (re)spawn.
            onSpawned = { deploymentRouter.sendSeed() },
            onRespawned = { editorRouter.reregisterLiveSessions() },
        )
    private val deps =
        BridgeDeps(
            project = project,
            channel = channel,
            handlers = handlers,
            gson = channel.gson,
            isProcessAlive = { supervisor.isAlive },
            ensureStartedAsync = { supervisor.ensureStartedAsync() },
            parentDisposable = this,
            notifications = notifications,
        )
    private val editorRouter = EditorSessionRouter(deps)
    private val deploymentRouter = DeploymentRouter(deps)
    private val diffRouter = DiffRouter(deps)
    private val scriptRouter = ScriptRouter(deps)
    private val secretStoreRouter = SecretStoreRouter(deps)
    private val hostUiRouter = HostUiRouter(deps)

    init {
        editorRouter.register()
        deploymentRouter.register()
        diffRouter.register()
        scriptRouter.register()
        secretStoreRouter.register()
        hostUiRouter.register()

        // Keep the core's active-editor pointer in sync with the focused tab so
        // operations that target "the active editor" address the right session
        // when several `.bpmn` files are open. Parented to this service, so the
        // subscription dies with the project.
        project.messageBus.connect(this).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    event.newFile?.url?.let { editorRouter.setActiveEditor(it) }
                }
            },
        )
    }

    // ── lifecycle ──────────────────────────────────────────────────────────────

    /** Pre-warms the bridge at project open so the first surface renders against a live process. */
    fun prewarm() = supervisor.prewarm()

    // ── editor sessions ──────────────────────────────────────────────────────────

    fun registerSession(session: CoreSession) = editorRouter.registerSession(session)

    fun notifyDocumentChanged(editorId: String, content: String) = editorRouter.notifyDocumentChanged(editorId, content)

    fun forwardWebviewMessage(editorId: String, rawMessage: String) = editorRouter.forwardWebviewMessage(editorId, rawMessage)

    fun disposeSession(editorId: String) = editorRouter.disposeSession(editorId)

    /** Pushes the current settings snapshot to the running core so an open editor reacts live. */
    fun pushSettings() = editorRouter.pushSettings()

    // ── deployment tool window ─────────────────────────────────────────────────

    fun registerDeploymentWindow(sink: (String) -> Unit) = deploymentRouter.registerDeploymentWindow(sink)

    fun unregisterDeploymentWindow() = deploymentRouter.unregisterDeploymentWindow()

    fun forwardDeploymentMessage(rawMessage: String) = deploymentRouter.forwardDeploymentMessage(rawMessage)

    fun setDeploymentOpen(open: Boolean) = deploymentRouter.setDeploymentOpen(open)

    // ── diff ─────────────────────────────────────────────────────────────────────

    fun openDiff(
        diffId: String,
        origin: String,
        beforeUri: String,
        beforeContent: String,
        postToBefore: (String) -> Unit,
        afterUri: String,
        afterContent: String,
        postToAfter: (String) -> Unit,
    ) = diffRouter.openDiff(diffId, origin, beforeUri, beforeContent, postToBefore, afterUri, afterContent, postToAfter)

    fun forwardDiffMessage(paneUri: String, rawMessage: String) = diffRouter.forwardDiffMessage(paneUri, rawMessage)

    fun disposeDiff(diffId: String) = diffRouter.disposeDiff(diffId)

    override fun dispose() {
        supervisor.dispose()
        editorRouter.clear()
        diffRouter.clear()
        deploymentRouter.clear()
    }
}
