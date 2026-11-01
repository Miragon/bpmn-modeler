package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import io.miragon.intellij.bpmn.bridge.BridgeDeps
import io.miragon.intellij.bpmn.bridge.BridgeErrorNotifier
import io.miragon.intellij.bpmn.bridge.BridgeRouters
import io.miragon.intellij.bpmn.bridge.DefaultBridgeProcessLauncher
import io.miragon.intellij.bpmn.bridge.ProcessSupervisor
import io.miragon.intellij.bpmn.bridge.RpcChannel
import io.miragon.intellij.bpmn.bridge.RpcHandlerRegistry
import io.miragon.intellij.bpmn.bridge.orderedCredentialStoreExecutor

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
 *  - render the core's `NotifierPort` and status-bar ports as IntelliJ UI, and
 *    its pickers (`picker/show`) as a native `JBPopup` chooser.
 *
 * **Role.** This service is the composition root + façade. It wires the bridge
 * collaborators in `io.miragon.intellij.bpmn.bridge` — the [RpcChannel]
 * transport, the [ProcessSupervisor], and the per-feature [BridgeRouters] populating
 * one [RpcHandlerRegistry] — and exposes the host-facing API as one-line delegations.
 * The decomposition mirrors the TS-side `bridge.ts` split into `composition/`.
 *
 * **Topology.** A project-level service: one supervised bridge per project
 * window, lazily spawned on the first editor and torn down with the project.
 * Sessions are keyed by editor id so messages route correctly when several
 * `.bpmn` files are open at once.
 *
 * **Robustness.** The bridge is spawned from a bundled, self-contained binary
 * (no system Node). A crash is detected via process exit and the bridge is
 * respawned with backoff; each page's edits the `Document` never received are
 * written into it, every live session is re-registered from that authoritative
 * IntelliJ `Document`, and a `GetBpmnFileCommand` is replayed so open editors
 * re-render. On dispose (project close / IDE exit) the process is
 * destroyed; because the bridge exits on stdin EOF, killing the JVM never
 * orphans it — the shutdown hook + `destroyForcibly` are belt-and-suspenders.
 */
@Service(Service.Level.PROJECT)
class CoreProcess(private val project: Project) : Disposable {
    // Lazy so the happy path never constructs the UI surface; shared between the
    // supervisor (spawn-failure errors) and the host-UI router.
    private val notifications = lazy { HostNotifications(project) }

    private val handlers = RpcHandlerRegistry()
    private val channel =
        RpcChannel { method, params, requestId -> handlers.dispatch(method, params, requestId) }
    private val supervisor: ProcessSupervisor =
        ProcessSupervisor(
            channel = channel,
            // Per-project cache segment so a prune never evicts another project's
            // marketplaces (getLocationHash is IntelliJ's stable per-project key).
            launcher = DefaultBridgeProcessLauncher(project.locationHash),
            // Adapt the host notifier behind the narrow port; `notifications` is
            // lazy, so the UI surface is still built only on the first error.
            notifier = BridgeErrorNotifier { message -> notifications.value.showError(message) },
            // Declared after the supervisor; safe because these lambdas only fire
            // post-construction, on the first (re)spawn or on a crash.
            onSpawned = { routers.deployment.sendSeed() },
            onRespawned = { routers.editor.reregisterLiveSessions() },
            // Clear any in-flight spinner on a crash so it can't hang waiting on a
            // progressEnd the dead core will never send.
            onProcessDown = { routers.hostUi.clearProgress() },
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
            credentialStoreExecutor = orderedCredentialStoreExecutor(),
        )
    private val routers = BridgeRouters(deps)

    init {
        routers.register()

        // Keep the core's active-editor pointer in sync with the focused tab so
        // operations that target "the active editor" address the right session
        // when several `.bpmn` files are open. Parented to this service, so the
        // subscription dies with the project.
        val connection = project.messageBus.connect(this)
        connection.subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    event.newFile?.url?.let { routers.editor.setActiveEditor(it) }
                }
            },
        )
        // Flush the webview's debounced changes into the buffer just before a
        // modeler tab closes. `beforeFileClosed` (not `dispose()`) is the only
        // viable hook: the Disposer kills the JCEF browser before the editor's
        // `dispose()` runs, so the browser is only reachable here. No-ops for
        // non-modeler files (flushBeforeClose guards on a live session).
        connection.subscribe(
            FileEditorManagerListener.Before.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener.Before {
                override fun beforeFileClosed(source: FileEditorManager, file: VirtualFile) {
                    routers.editor.flushBeforeClose(file.url)
                }
            },
        )
    }

    // ── lifecycle ──────────────────────────────────────────────────────────────

    /** Pre-warms the bridge at project open so the first surface renders against a live process. */
    fun prewarm() = supervisor.prewarm()

    // ── editor sessions ──────────────────────────────────────────────────────────

    fun registerSession(session: CoreSession) = routers.editor.registerSession(session)

    fun notifyDocumentChanged(session: CoreSession, readContent: () -> String) =
        routers.editor.notifyDocumentChanged(session, readContent)

    fun forwardWebviewMessage(session: CoreSession, rawMessage: String) = routers.editor.forwardWebviewMessage(session, rawMessage)

    fun disposeSession(session: CoreSession) = routers.editor.disposeSession(session)

    /**
     * Requests an SVG export of the open diagram; [onSvg] fires with the rendered
     * SVG when the webview echoes it back. Returns `false` when no session is open
     * for [editorId]. Backs the Copy/Save Diagram as SVG actions.
     */
    fun requestDiagramSvg(editorId: String, onSvg: (String) -> Unit): Boolean =
        routers.editor.requestDiagramSvg(editorId, onSvg)

    /**
     * Flushes debounced webview changes into the buffer before a tab closes so
     * the close doesn't drop the sub-debounce tail. Driven from the
     * `beforeFileClosed` hook below, where the JCEF browser is still alive.
     */
    fun flushBeforeClose(editorId: String) = routers.editor.flushBeforeClose(editorId)

    /** Pushes the current settings snapshot to the running core so an open editor reacts live. */
    fun pushSettings() = routers.editor.pushSettings()

    /**
     * Soft-reloads every open modeler by re-registering its live session (re-seeds
     * settings, re-scans element templates, replays the render) — the fallback for
     * stale templates on setups where the filesystem watcher never fires (WSL over a
     * symlinked workspace). No JCEF hard reload, and each page's edits reach the
     * Document before the re-render, so unsaved edits survive.
     */
    fun reloadModeler() = routers.editor.reregisterLiveSessions()

    // ── template marketplace ───────────────────────────────────────────────────

    /**
     * Fires `marketplace/add` for the pasted location; backs the Tools-menu Add
     * action. `appWide` carries the dialog's scope choice through to the persist.
     */
    fun addMarketplace(location: String, appWide: Boolean) = routers.marketplace.addMarketplace(location, appWide)

    /** Fires `marketplace/update` to re-fetch every configured marketplace. */
    fun updateMarketplaces() = routers.marketplace.updateMarketplaces()

    /**
     * Fires `marketplace/remove` to prune the caches of already-unregistered
     * marketplaces without re-fetching the rest; backs the Tools-menu Remove
     * action. `removedCount` is the selection size, echoed into the summary toast.
     */
    fun removeMarketplaces(removedCount: Int) = routers.marketplace.removeMarketplaces(removedCount)

    // ── modeler commands ───────────────────────────────────────────────────────

    /** Fires `modeler/changeEngineVersion` for the given editor session (its file url). */
    fun changeEngineVersion(editorId: String) =
        routers.modelerCommands.changeEngineVersion(editorId)

    /** Fires `linting/toggle`; the bridge flips the user's lint choice. */
    fun toggleLinting() = routers.modelerCommands.toggleLinting()

    /** Fires `migration/migrateAll` for the project's workspace root. */
    fun migrateAllDiagrams() = routers.modelerCommands.migrateAllDiagrams()

    /** Fires `layout/format` for the core's active editor session. */
    fun formatDiagram() = routers.modelerCommands.formatDiagram()

    /** Fires `layout/cleanup`; nothing is removed before the user confirms. */
    fun cleanupDiagram() = routers.modelerCommands.cleanupDiagram()

    /** Fires `deployment/switchTarget`; the core shows the target picker. */
    fun switchDeploymentTarget() = routers.modelerCommands.switchDeploymentTarget()

    /** Fires `deployment/deployFiles`; the core picks files and deploys to the active target. */
    fun deployFiles() = routers.modelerCommands.deployFiles()

    /** Fires `deployment/deployActive`; the core saves and deploys the active diagram. */
    fun deployDiagram() = routers.modelerCommands.deployDiagram()

    /** Fires `deployment/verify`; the core reconciles the ledger against the C7 engine. */
    fun verifyDeployment() = routers.modelerCommands.verifyDeployment()

    /** Fires `deployment/statusBarMenu`; the core shows the switch/verify chooser. */
    fun deploymentStatusMenu() = routers.modelerCommands.deploymentStatusMenu()

    /**
     * Fires `script/openAll` for the Tools-menu action; the bridge asks the active
     * BPMN webview for its inline script tasks and writes a file for each. No tabs
     * open — live sync starts when the user opens a generated file (adoption).
     */
    fun openAllScriptTasks() = routers.script.openAllScriptTasks()

    // ── deployment tool window ─────────────────────────────────────────────────

    fun registerDeploymentWindow(sink: (String) -> Unit) = routers.deployment.registerDeploymentWindow(sink)

    fun unregisterDeploymentWindow() = routers.deployment.unregisterDeploymentWindow()

    fun forwardDeploymentMessage(rawMessage: String) = routers.deployment.forwardDeploymentMessage(rawMessage)

    fun setDeploymentOpen(open: Boolean) = routers.deployment.setDeploymentOpen(open)

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
    ) = routers.diff.openDiff(diffId, origin, beforeUri, beforeContent, postToBefore, afterUri, afterContent, postToAfter)

    fun forwardDiffMessage(paneUri: String, rawMessage: String) = routers.diff.forwardDiffMessage(paneUri, rawMessage)

    fun disposeDiff(diffId: String) = routers.diff.disposeDiff(diffId)

    override fun dispose() {
        supervisor.dispose()
        // dispose() sets `disposed`, so handleExit skips onProcessDown on the
        // project-close path; clear spinners here so none survives the teardown.
        routers.hostUi.clearProgress()
        routers.editor.clear()
        routers.diff.clear()
        routers.deployment.clear()
    }
}
