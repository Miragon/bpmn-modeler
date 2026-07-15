package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import java.util.concurrent.ConcurrentHashMap

/**
 * Project-scoped surface for the "Edit Script" feature: opens an inline BPMN
 * script as an editor tab and streams keystrokes back to the core.
 *
 * The host owns no script semantics. The core (bridge) addresses each script by
 * an opaque [scriptId], writes the script as a real file under
 * `<configFolder>/tmp/scripting/`, and hands over its absolute path — a real
 * [VirtualFile] tab is what re-enables IdeaVim and file-based AI tooling. When
 * the path cannot be resolved this degrades to an in-memory [LightVirtualFile]
 * built from the payload's `content`, restoring the previous behaviour.
 *
 * Echo prevention: keystrokes only ever originate from the user *except* for
 * [updateContent], the core's model-side overwrite (canvas undo/redo, document
 * reload) — those writes are marked in [programmaticEdits] so the document
 * listener does not stream them straight back as `script/didChange`.
 *
 * @param parentDisposable Ties the editor-manager subscription and every
 *   per-script document listener to the owning service's lifetime, so all
 *   tracking is released when the project's [CoreProcess] is disposed.
 * @param onChange Fired with the buffer text on each keystroke in a tracked tab.
 * @param onClosed Fired once whenever a tab is closed — by the user, or as the
 *   completion ack of our own [closeScript]. A user close only releases the
 *   core's tracking (the file survives so a re-open can rewrite it); the core
 *   deletes on element deletion or editor dispose, whose [closeScript] ack
 *   always lands *after* the flush-save below, so an eager delete can't race
 *   the save and write the file right back as an orphan.
 */
class ScriptEditorManager(
    private val project: Project,
    private val parentDisposable: Disposable,
    private val onChange: (scriptId: String, content: String) -> Unit,
    private val onClosed: (scriptId: String) -> Unit,
) {
    private val log = Logger.getInstance(ScriptEditorManager::class.java)

    private data class Tracked(val file: VirtualFile, val listener: Disposable)

    private val scripts = ConcurrentHashMap<String, Tracked>()

    // scriptIds whose tab we are closing ourselves; lets `fileClosed` tell a
    // programmatic close (script/close) apart from a user-initiated one.
    private val closingProgrammatically = ConcurrentHashMap.newKeySet<String>()

    // scriptIds whose document we are writing ourselves (updateContent); lets
    // `documentChanged` tell the core's overwrite apart from a user keystroke,
    // which would otherwise echo straight back as `script/didChange`.
    private val programmaticEdits = ConcurrentHashMap.newKeySet<String>()

    init {
        project.messageBus.connect(parentDisposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    val scriptId = scripts.entries.find { it.value.file == file }?.key ?: return
                    // Our own close acks from `closeScript` after its flush; swallow the echo.
                    if (closingProgrammatically.remove(scriptId)) return
                    flushUnsaved(file)
                    untrack(scriptId)
                    onClosed(scriptId)
                }
            },
        )
    }

    /**
     * Opens a script tab, or reveals the existing one. A re-open never rewrites
     * content: the same [scriptId] maps to the live tab, so in-flight edits the
     * user hasn't synced yet are preserved.
     *
     * @param filePath Absolute path of the real file the core wrote; resolved
     *   through the local VFS (with a refresh, since the write happened outside
     *   IntelliJ). `null` — or a failed resolution — falls back to an in-memory
     *   [LightVirtualFile] built from [content].
     * @param completion Kind-scoped bean/method catalog, attached to the file as
     *   UserData so [ScriptCompletionContributor] can drive autocomplete and tell
     *   our script tabs apart from other open files. A re-open keeps the catalog
     *   already on the tracked file (UserData persists across the reveal).
     */
    fun openScript(
        scriptId: String,
        fileName: String,
        filePath: String?,
        content: String,
        completion: ScriptCompletionModel?,
    ) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            val manager = FileEditorManager.getInstance(project)

            scripts[scriptId]?.let {
                manager.openFile(it.file, true)
                return@invokeLater
            }

            val file = resolveScriptFile(fileName, filePath, content)
            // Attach before opening so the contributor sees it on the first keystroke.
            file.putUserData(SCRIPT_COMPLETION_KEY, completion)
            // Stable for the tab's lifetime (updateVariables swaps only the catalog),
            // so the "Declare in variable manifest" intention can address this script.
            // Set *before* openFile so ScriptRouter's adoption listener sees the key
            // on the resulting fileOpened and skips it as our own open, not an
            // external one to re-report as script/didOpenExternal.
            file.putUserData(SCRIPT_ID_KEY, scriptId)
            manager.openFile(file, true)

            val document = FileDocumentManager.getInstance().getDocument(file)
            if (document == null) {
                // No document means no edit stream; still track so reveal/close work.
                log.warn("No document for script file: $fileName")
                scripts[scriptId] = Tracked(file, Disposer.newDisposable(parentDisposable))
                return@invokeLater
            }

            val listenerDisposable = Disposer.newDisposable(parentDisposable, "modeler-script-$scriptId")
            document.addDocumentListener(
                object : DocumentListener {
                    override fun documentChanged(event: DocumentEvent) {
                        if (programmaticEdits.contains(scriptId)) return
                        onChange(scriptId, event.document.text)
                    }
                },
                listenerDisposable,
            )
            scripts[scriptId] = Tracked(file, listenerDisposable)
        }
    }

    /**
     * Resolves the on-disk script through the local VFS, falling back to an
     * in-memory [LightVirtualFile] when the path is absent or unresolvable —
     * highlighting still works there because the filename's extension drives
     * FileType inference in both cases.
     */
    private fun resolveScriptFile(fileName: String, filePath: String?, content: String): VirtualFile {
        if (filePath != null) {
            // refreshAndFind, not find: the core wrote the file outside
            // IntelliJ, so the VFS snapshot may not know it yet.
            val resolved = LocalFileSystem.getInstance()
                .refreshAndFindFileByPath(FileUtil.toSystemIndependentName(filePath))
            if (resolved != null) return resolved
            log.warn("Script file not resolvable, using in-memory fallback: $filePath")
        }
        return LightVirtualFile(fileName, content)
    }

    /**
     * Overwrites a tracked tab's content on the core's behalf — the script
     * changed on the *model* side (canvas undo/redo, document reload). Marked
     * in [programmaticEdits] for the synchronous span of the write so the
     * document listener doesn't stream the overwrite back as a user edit.
     */
    fun updateContent(scriptId: String, content: String) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            val tracked = scripts[scriptId] ?: return@invokeLater
            val document = FileDocumentManager.getInstance().getDocument(tracked.file) ?: return@invokeLater
            if (document.text == content) return@invokeLater
            programmaticEdits.add(scriptId)
            try {
                WriteCommandAction.runWriteCommandAction(project) {
                    document.setText(content)
                }
            } finally {
                programmaticEdits.remove(scriptId)
            }
        }
    }

    /**
     * Replaces the process-variable model on a tracked script tab so completion
     * goes live without reopening. The contributor reads [SCRIPT_COMPLETION_KEY]
     * fresh on every invocation, so swapping the UserData here is immediately
     * effective. No-op for an untracked script or one opened without a catalog.
     */
    fun updateVariables(scriptId: String, variables: List<VariableInfo>) {
        val tracked = scripts[scriptId] ?: return
        val current = tracked.file.getUserData(SCRIPT_COMPLETION_KEY) ?: return
        tracked.file.putUserData(SCRIPT_COMPLETION_KEY, current.copy(variables = variables))
    }

    /**
     * Closes a script tab on the core's behalf (element deletion or BPMN editor
     * dispose); no user-close semantics. Flushes, closes, then acks via
     * [onClosed] — only that ordering lets the core delete the on-disk file
     * without racing the flush-save. (A user-initiated close deletes nothing,
     * so it has no such ordering constraint.)
     */
    fun closeScript(scriptId: String) {
        val tracked = scripts[scriptId]
        if (tracked == null) {
            // Never tracked host-side (the open failed or raced the close):
            // nothing to flush — ack so the core still deletes the file it
            // wrote. Via EDT like every other ack, keeping callback threading
            // uniform for the channel.
            ApplicationManager.getApplication().invokeLater { onClosed(scriptId) }
            return
        }
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) {
                // No ack: the channel is going down with the project; the
                // core's next-start orphan sweep owns the leftover file.
                untrack(scriptId)
                return@invokeLater
            }
            flushUnsaved(tracked.file)
            // Mark before closing so the synchronous `fileClosed` swallows the echo.
            closingProgrammatically.add(scriptId)
            FileEditorManager.getInstance(project).closeFile(tracked.file)
            // If the tab was already gone, `fileClosed` never fires; clean up here.
            if (scripts.containsKey(scriptId)) {
                closingProgrammatically.remove(scriptId)
                untrack(scriptId)
            }
            onClosed(scriptId)
        }
    }

    /**
     * Flushes a still-cached unsaved document before the core deletes the
     * file: a lingering unsaved document would be written back by IntelliJ's
     * next save-all, resurrecting the just-deleted file as an orphan.
     */
    private fun flushUnsaved(file: VirtualFile) {
        val fdm = FileDocumentManager.getInstance()
        fdm.getCachedDocument(file)
            ?.takeIf { fdm.isDocumentUnsaved(it) }
            ?.let { fdm.saveDocument(it) }
    }

    private fun untrack(scriptId: String) {
        scripts.remove(scriptId)?.let { Disposer.dispose(it.listener) }
    }
}
