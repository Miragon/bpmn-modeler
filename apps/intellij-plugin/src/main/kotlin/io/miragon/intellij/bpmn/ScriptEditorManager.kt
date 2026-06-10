package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import java.util.concurrent.ConcurrentHashMap

/**
 * Project-scoped surface for the "Edit Script" feature: opens an inline BPMN
 * script as an in-memory editor tab and streams keystrokes back to the core.
 *
 * The host owns no script semantics. The core (bridge) addresses each script by
 * an opaque [scriptId] and supplies a display `fileName` whose extension lets
 * IntelliJ infer the FileType for syntax highlighting; this class only maps that
 * id to a [LightVirtualFile] tab. Echo prevention needs no guard: content is
 * fixed at construction *before* the document listener is attached, and the core
 * never re-writes a script tab after open, so every edit event can only be the
 * user's — there is nothing to filter out.
 *
 * @param parentDisposable Ties the editor-manager subscription and every
 *   per-script document listener to the owning service's lifetime, so all
 *   tracking is released when the project's [CoreProcess] is disposed.
 * @param onChange Fired with the buffer text on each keystroke in a tracked tab.
 * @param onUserClose Fired once when the *user* closes a tab — distinguished
 *   from our own [closeScript] so the BPMN-editor-dispose path doesn't echo.
 */
class ScriptEditorManager(
    private val project: Project,
    private val parentDisposable: Disposable,
    private val onChange: (scriptId: String, content: String) -> Unit,
    private val onUserClose: (scriptId: String) -> Unit,
) {
    private val log = Logger.getInstance(ScriptEditorManager::class.java)

    private data class Tracked(val file: VirtualFile, val listener: Disposable)

    private val scripts = ConcurrentHashMap<String, Tracked>()

    // scriptIds whose tab we are closing ourselves; lets `fileClosed` tell a
    // programmatic close (script/close) apart from a user-initiated one.
    private val closingProgrammatically = ConcurrentHashMap.newKeySet<String>()

    init {
        project.messageBus.connect(parentDisposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileClosed(source: FileEditorManager, file: VirtualFile) {
                    val scriptId = scripts.entries.find { it.value.file == file }?.key ?: return
                    // Our own close already dropped tracking core-side; swallow it.
                    if (closingProgrammatically.remove(scriptId)) return
                    untrack(scriptId)
                    onUserClose(scriptId)
                }
            },
        )
    }

    /**
     * Opens a script tab, or reveals the existing one. A re-open never rewrites
     * content: the same [scriptId] maps to the live tab, so in-flight edits the
     * user hasn't synced yet are preserved.
     *
     * @param completion Kind-scoped bean/method catalog, attached to the file as
     *   UserData so [ScriptCompletionContributor] can drive autocomplete and tell
     *   our script tabs apart from other open files. A re-open keeps the catalog
     *   already on the tracked file (UserData persists across the reveal).
     */
    fun openScript(
        scriptId: String,
        fileName: String,
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

            // The filename's extension is what drives FileType inference (hence
            // highlighting); the content is fixed here, before the listener below.
            val file = LightVirtualFile(fileName, content)
            // Attach before opening so the contributor sees it on the first keystroke.
            file.putUserData(SCRIPT_COMPLETION_KEY, completion)
            manager.openFile(file, true)

            val document = FileDocumentManager.getInstance().getDocument(file)
            if (document == null) {
                // No document means no edit stream; still track so reveal/close work.
                log.warn("No document for script LightVirtualFile: $fileName")
                scripts[scriptId] = Tracked(file, Disposer.newDisposable(parentDisposable))
                return@invokeLater
            }

            val listenerDisposable = Disposer.newDisposable(parentDisposable, "modeler-script-$scriptId")
            document.addDocumentListener(
                object : DocumentListener {
                    override fun documentChanged(event: DocumentEvent) {
                        onChange(scriptId, event.document.text)
                    }
                },
                listenerDisposable,
            )
            scripts[scriptId] = Tracked(file, listenerDisposable)
        }
    }

    /** Closes a script tab on the core's behalf (BPMN editor disposed); no user-close echo. */
    fun closeScript(scriptId: String) {
        val tracked = scripts[scriptId] ?: return
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) {
                untrack(scriptId)
                return@invokeLater
            }
            // Mark before closing so the synchronous `fileClosed` swallows the echo.
            closingProgrammatically.add(scriptId)
            FileEditorManager.getInstance(project).closeFile(tracked.file)
            // If the tab was already gone, `fileClosed` never fires; clean up here.
            if (scripts.containsKey(scriptId)) {
                closingProgrammatically.remove(scriptId)
                untrack(scriptId)
            }
        }
    }

    private fun untrack(scriptId: String) {
        scripts.remove(scriptId)?.let { Disposer.dispose(it.listener) }
    }
}
