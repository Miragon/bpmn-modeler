package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages
import com.intellij.util.concurrency.AppExecutorUtil
import io.miragon.intellij.bpmn.AutoHidingStatusSlots
import io.miragon.intellij.bpmn.HostPicker
import io.miragon.intellij.bpmn.StatusAction
import io.miragon.intellij.bpmn.StatusBarSlots
import io.miragon.intellij.bpmn.StatusIcon
import io.miragon.intellij.bpmn.StatusSlot
import io.miragon.intellij.bpmn.StatusSlots
import io.miragon.intellij.bpmn.StatusTone
import io.miragon.intellij.bpmn.StatusView
import io.miragon.intellij.bpmn.WireValue
import io.miragon.intellij.bpmn.wireValueOf
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

/**
 * Routes the core's host-UI ports — the pickers, clipboard, `StatusBarPort` and
 * `NotifierPort` — onto native IntelliJ surfaces. Every status frame becomes one
 * view of one slot in [statusSlots]; the other handlers delegate to the system
 * clipboard or the lazy [io.miragon.intellij.bpmn.HostNotifications].
 */
internal class HostUiRouter(
    private val deps: BridgeDeps,
    private val statusSlots: StatusSlots =
        AutoHidingStatusSlots(StatusBarSlots(deps.project), AppExecutorUtil.getAppScheduledExecutorService()),
) {
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
            .on("confirm/show") { params, id -> handleConfirm(params, id) }
            .on("clipboard/read") { _, id -> handleClipboardRead(id) }
            .on("clipboard/write") { params, _ -> handleClipboardWrite(params) }
            .on("statusBar/update") { params, _ -> handleStatusUpdate(params) }
            .on("notifier/showInfo") { params, _ -> notifications.showInfo(params.get("message").asString) }
            .on("notifier/showWarning") { params, _ -> notifications.showWarning(params.get("message").asString) }
            .on("notifier/showError") { params, _ -> notifications.showError(params.get("message").asString) }
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
     * Completes and drops every in-flight spinner future so a blocked
     * [Task.Backgroundable] exits instead of hanging on a `progressEnd` a crashed
     * core will never send. Invoked when the bridge goes down (process death or
     * dispose); without it a mid-run crash leaves the spinner until IDE restart
     * and a progress-pool thread parked on `future.get()`.
     */
    fun clearProgress() {
        for (title in progressTasks.keys.toList()) progressTasks.remove(title)?.complete(null)
    }

    /**
     * Shows or hides one slot. Only `statusBar/update`'s top-level keys are in
     * `protocol.json`, so the view's fields are read here once; a value this host
     * does not know is logged and left out rather than failing the frame.
     */
    private fun handleStatusUpdate(params: JsonObject) {
        val slotName = params.optionalString("slot")
        val slot = slotName?.let { wireValueOf<StatusSlot>(it) }
        if (slot == null) {
            log.warn("statusBar/update: no placement for status slot '$slotName'")
            return
        }
        val view = params.get("view")?.takeIf { it.isJsonObject }?.asJsonObject
        if (view == null) {
            statusSlots.hide(slot)
        } else {
            statusSlots.show(slot, readStatusView(view))
        }
    }

    private fun readStatusView(view: JsonObject): StatusView =
        StatusView(
            text = view.optionalString("text").orEmpty(),
            icon = view.optionalWireValue<StatusIcon>("icon"),
            tooltip = view.optionalString("tooltip"),
            tone = view.optionalWireValue<StatusTone>("tone") ?: StatusTone.NEUTRAL,
            action = view.optionalWireValue<StatusAction>("action"),
            transient = view.optionalBoolean("transient") ?: false,
        )

    private inline fun <reified E> JsonObject.optionalWireValue(key: String): E? where E : Enum<E>, E : WireValue {
        val name = optionalString(key) ?: return null
        val value = wireValueOf<E>(name)
        if (value == null) log.warn("statusBar/update: unknown $key '$name', left out")
        return value
    }

    /**
     * Modal yes/no listing what is about to be removed.
     *
     * Every path that cannot ask replies `false`: a disposed project or a
     * missing reply id must never be read as consent to delete.
     */
    private fun handleConfirm(params: JsonObject, id: Int?) {
        if (id == null) return
        val title = params.optionalString("title").orEmpty()
        val confirmLabel = params.optionalString("confirmLabel") ?: "Continue"
        val details = params.getAsJsonArray("details")?.map { it.asString }.orEmpty()

        deps.channel.replyFromEdt(id, "confirm/show") {
            if (project.isDisposed) return@replyFromEdt mapOf("confirmed" to false)
            val message = (listOf(title) + details).joinToString("\n")
            val choice =
                Messages.showYesNoDialog(
                    project,
                    message,
                    confirmLabel,
                    confirmLabel,
                    "Cancel",
                    Messages.getWarningIcon(),
                )
            mapOf("confirmed" to (choice == Messages.YES))
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
        val title = params.optionalString("title")
        val placeholder = params.optionalString("placeholder").orEmpty()
        val canPickMany = params.optionalBoolean("canPickMany") ?: false
        val items =
            params.getAsJsonArray("items").mapIndexed { index, element ->
                val obj = element.asJsonObject
                HostPicker.PickItem(
                    index,
                    obj.get("label").asString,
                    obj.optionalString("description"),
                )
            }
        deps.channel.replyLaterFromEdt(id, "picker/show") { reply ->
            if (project.isDisposed) {
                reply.result(mapOf("selected" to null))
                return@replyLaterFromEdt
            }
            HostPicker.show(project, title, placeholder, canPickMany, items) { selected ->
                reply.result(mapOf("selected" to selected))
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
        deps.channel.replyFromEdt(id, "clipboard/read") {
            val text =
                runCatching {
                    CopyPasteManager.getInstance().getContents<String>(DataFlavor.stringFlavor)
                }.getOrNull().orEmpty()
            mapOf("text" to text)
        }
    }

    /** Writes the webview's copied text onto the system clipboard (fire-and-forget). */
    private fun handleClipboardWrite(params: JsonObject) {
        val text = params.optionalString("text").orEmpty()
        ApplicationManager.getApplication().invokeLater {
            CopyPasteManager.getInstance().setContents(StringSelection(text))
        }
    }

    private fun JsonObject.optionalString(key: String): String? = get(key)?.takeIf { !it.isJsonNull }?.asString

    private fun JsonObject.optionalBoolean(key: String): Boolean? = get(key)?.takeIf { !it.isJsonNull }?.asBoolean
}
