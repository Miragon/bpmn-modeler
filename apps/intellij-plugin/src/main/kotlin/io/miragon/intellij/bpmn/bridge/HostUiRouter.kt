package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import io.miragon.intellij.bpmn.EngineStatusBarWidget
import io.miragon.intellij.bpmn.HostPicker
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes the core's host-UI ports — `PickerPort`, clipboard, `StatusBarPort`,
 * and `NotifierPort` — onto native IntelliJ surfaces. Stateless: every handler
 * delegates to a project-scoped widget, the system clipboard, or the lazy
 * [io.miragon.intellij.bpmn.HostNotifications].
 */
internal class HostUiRouter(private val deps: BridgeDeps) {
    private val log = Logger.getInstance(HostUiRouter::class.java)

    private val notifications get() = deps.notifications.value
    private val project get() = deps.project

    // One in-flight spinner per progress title. The core brackets a run with
    // progressStart/progressEnd; the future is what a `Task.Backgroundable` blocks
    // on so the spinner lives exactly as long as the core-side work.
    private val progressTasks = ConcurrentHashMap<String, CompletableFuture<Void>>()

    fun register() {
        deps.handlers
            .on("picker/show") { params, id -> handlePick(params, id) }
            .on("clipboard/read") { _, id -> handleClipboardRead(id) }
            .on("clipboard/write") { params, _ -> handleClipboardWrite(params) }
            .on("statusBar/showEngineVersion") { params, _ ->
                val label = if (params.get("platform")?.asString == "c7") "Camunda 7" else "Camunda 8"
                EngineStatusBarWidget.updateEngine(project, "$label ${params.get("version")?.asString}")
            }
            .on("statusBar/hideEngineVersion") { _, _ -> EngineStatusBarWidget.updateEngine(project, null) }
            .on("statusBar/disposeEngineVersion") { _, _ -> EngineStatusBarWidget.updateEngine(project, null) }
            .on("statusBar/templatesReady") { params, _ ->
                EngineStatusBarWidget.updateTemplateCount(project, params.get("count")?.asInt ?: 0)
            }
            .on("statusBar/templatesHide") { _, _ -> EngineStatusBarWidget.updateTemplateCount(project, null) }
            .on("statusBar/templatesLoading") { _, _ -> EngineStatusBarWidget.showTemplatesLoading(project) }
            .on("notifier/showInfo") { params, _ -> notifications.showInfo(params.get("message").asString) }
            .on("notifier/showError") { params, _ -> notifications.showError(params.get("message").asString) }
            .on("notifier/notifyError") { params, _ ->
                notifications.notifyError(params.get("context").asString, params.get("message").asString)
            }
            .on("notifier/openConsole") { _, _ -> notifications.openLoggingConsole() }
            .on("notifier/openDocument") { params, _ -> notifications.openDocument(params.get("path").asString) }
            .on("notifier/log") { params, _ ->
                notifications.log(params.get("level")?.asString, params.get("message")?.asString.orEmpty())
            }
            .on("notifier/progressStart") { params, _ ->
                handleProgressStart(params.get("title")?.asString.orEmpty())
            }
            .on("notifier/progressEnd") { params, _ ->
                handleProgressEnd(params.get("title")?.asString.orEmpty())
            }
    }

    /**
     * Launches an indeterminate background spinner titled by the core's progress
     * label, backed by a [CompletableFuture] the `run()` blocks on. Keeps the
     * existing log line (the diagnostic trail) and completes any stale same-title
     * future so its task exits — a title is only ever bracketed by one start/end
     * pair core-side, so a residual one means the previous run threw past its end.
     * Benefits deployments too, which use the same progress bracket.
     */
    private fun handleProgressStart(title: String) {
        log.debug("notifier/progressStart: $title")
        val future = CompletableFuture<Void>()
        progressTasks.put(title, future)?.complete(null)
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) {
                future.complete(null)
                return@invokeLater
            }
            ProgressManager.getInstance().run(
                object : Task.Backgroundable(project, title, false) {
                    override fun run(indicator: ProgressIndicator) {
                        indicator.isIndeterminate = true
                        // Blocks until progressEnd completes the future; the work
                        // itself runs core-side, so the host only holds the spinner.
                        runCatching { future.get() }
                    }
                },
            )
        }
    }

    private fun handleProgressEnd(title: String) {
        log.debug("notifier/progressEnd: $title")
        progressTasks.remove(title)?.complete(null)
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
                deps.channel.reply(id, mapOf("selected" to null))
                return@invokeLater
            }
            HostPicker.show(project, title, placeholder, canPickMany, items) { selected ->
                deps.channel.reply(id, mapOf("selected" to selected))
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
            id?.let { deps.channel.reply(it, mapOf("text" to text)) }
        }
    }

    /** Writes the webview's copied text onto the system clipboard (fire-and-forget). */
    private fun handleClipboardWrite(params: JsonObject) {
        val text = params.get("text")?.takeIf { !it.isJsonNull }?.asString.orEmpty()
        ApplicationManager.getApplication().invokeLater {
            CopyPasteManager.getInstance().setContents(StringSelection(text))
        }
    }
}
