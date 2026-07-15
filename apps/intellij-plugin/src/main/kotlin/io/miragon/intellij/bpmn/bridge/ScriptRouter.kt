package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VirtualFile
import io.miragon.intellij.bpmn.SCRIPT_ID_KEY
import io.miragon.intellij.bpmn.ScriptCompletionModel
import io.miragon.intellij.bpmn.ScriptEditorManager
import io.miragon.intellij.bpmn.VariableInfo

/**
 * Routes the inline "Edit Script" feature. The host is a dumb surface keyed by
 * opaque `scriptId`: it opens a script as an editor tab and streams keystrokes
 * back as `script/didChange`; `script/didClose` reports any tab close — user-
 * initiated or the completion ack of a core-initiated `script/close`. The core
 * deletes the on-disk file only on `didClose`, after the host's flush-save.
 *
 * Adoption: a script file opened outside `script/open` (Project view, or the
 * panel button on an untracked file) is reported to the core via
 * `script/didOpenExternal`, which starts live sync. The listener is armed
 * *eagerly* in [register] rather than inside the lazy [ScriptEditorManager]:
 * since the "Generate Script Files" command sends no `script/open`, a
 * manager-hosted listener would never arm, and a Project-view open of a
 * generated file would be silently dropped.
 *
 * The [ScriptEditorManager] is lazy so opening a `.bpmn` file that never edits a
 * script touches no editor-manager machinery; it parents to the `CoreProcess`
 * service so its listeners die with the project.
 */
internal class ScriptRouter(private val deps: BridgeDeps) {
    private val scriptEditors by lazy {
        ScriptEditorManager(
            deps.project,
            deps.parentDisposable,
            onChange = { scriptId, content ->
                deps.channel.notify("script/didChange", linkedMapOf("scriptId" to scriptId, "content" to content))
            },
            onClosed = { scriptId ->
                deps.channel.notify("script/didClose", linkedMapOf("scriptId" to scriptId))
            },
        )
    }

    fun register() {
        // Eager adoption listener — see the class KDoc for why it can't live in
        // the lazy manager. Parented to CoreProcess so it dies with the project.
        deps.project.messageBus.connect(deps.parentDisposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(source: FileEditorManager, file: VirtualFile) {
                    onFileOpened(file)
                }
            },
        )

        deps.handlers
            // `completion` is optional and carries the kind-scoped catalog the
            // bridge already resolved; fromJson tolerates a missing/null member.
            .on("script/open") { params, _ ->
                scriptEditors.openScript(
                    params.get("scriptId").asString,
                    params.get("fileName").asString,
                    // Tolerate an absent/null path (older bridge, unwritable
                    // disk) — the manager falls back to an in-memory tab.
                    params.get("filePath")?.takeIf { !it.isJsonNull }?.asString,
                    params.get("content").asString,
                    deps.gson.fromJson(params.get("completion"), ScriptCompletionModel::class.java),
                )
            }
            .on("script/close") { params, _ -> scriptEditors.closeScript(params.get("scriptId").asString) }
            // Model-side overwrite (canvas undo/redo, document reload) — echo-
            // guarded in the manager so it doesn't bounce back as didChange.
            .on("script/updateContent") { params, _ ->
                scriptEditors.updateContent(
                    params.get("scriptId").asString,
                    params.get("content").asString,
                )
            }
            // Live variable model push: swap the script tab's completion catalog
            // so the next completion invocation sees the current variables.
            .on("script/updateVariables") { params, _ ->
                scriptEditors.updateVariables(
                    params.get("scriptId").asString,
                    deps.gson.fromJson(
                        params.get("variables"),
                        Array<VariableInfo>::class.java,
                    ).orEmpty().toList(),
                )
            }
    }

    /**
     * Decides whether a just-opened file is an adoptable inline script and, if so,
     * reports it to the core. Skips our *own* opens — [ScriptEditorManager]
     * stamps [SCRIPT_ID_KEY] before `openFile`, so a set key means the file is
     * already tracked — and any file outside a `tmp/scripting` directory.
     */
    private fun onFileOpened(file: VirtualFile) {
        if (file.getUserData(SCRIPT_ID_KEY) != null) return
        val path = FileUtil.toSystemIndependentName(file.path)
        if (!path.contains("/tmp/scripting/")) return
        notifyDidOpenExternal(path)
    }

    /**
     * Host→Core: a script file was opened outside the `script/open` flow. Extracted
     * as an `internal fun` so a test can assert the emitted frame without driving a
     * real editor open. `filePath` is system-independent so `parseScriptPath` on the
     * core side matches regardless of the host OS's separator.
     */
    internal fun notifyDidOpenExternal(filePath: String) {
        deps.channel.notify("script/didOpenExternal", linkedMapOf("filePath" to filePath))
    }

    /**
     * Host→Core: the "Declare in variable manifest" intention asks the core to
     * scaffold a manifest entry for an unknown variable. Fire-and-forget — the
     * core writes the file, reveals it via `notifier/openDocument`, and the
     * manifest watcher re-pushes `script/updateVariables`.
     */
    fun appendToManifest(scriptId: String, name: String) {
        deps.channel.notify(
            "script/appendToManifest",
            linkedMapOf("scriptId" to scriptId, "name" to name),
        )
    }

    /**
     * Host→Core: Tools ▸ Generate Script Files for Script Tasks. The bridge asks
     * the active BPMN webview for its inline script tasks and writes a file for
     * each (no tabs). Follows the marketplace pattern — the action can fire before
     * the bridge is up, so the buffered notify plus
     * [ensureStartedAsync][BridgeDeps.ensureStartedAsync] guarantees delivery once
     * it spawns.
     */
    fun openAllScriptTasks() {
        deps.channel.notify("script/openAll", linkedMapOf<String, Any>())
        deps.ensureStartedAsync()
    }
}
