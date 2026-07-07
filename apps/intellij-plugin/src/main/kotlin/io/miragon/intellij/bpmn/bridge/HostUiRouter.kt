package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.ide.CopyPasteManager
import io.miragon.intellij.bpmn.EngineStatusBarWidget
import io.miragon.intellij.bpmn.HostPicker
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection

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
            .on("notifier/progressStart") { params, _ -> log.debug("notifier/progressStart: ${params.get("title")?.asString}") }
            .on("notifier/progressEnd") { params, _ -> log.debug("notifier/progressEnd: ${params.get("title")?.asString}") }
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
