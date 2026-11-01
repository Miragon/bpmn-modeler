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
            .on("picker/show", ::readPick)
            .on("confirm/show", ::readConfirm)
            .on("clipboard/read") { RpcAction(::handleClipboardRead) }
            .on("clipboard/write") { params ->
                val text = params.optionalString("text").orEmpty()
                RpcAction { handleClipboardWrite(text) }
            }
            .on("statusBar/update") { params ->
                val slotName = params.optionalString("slot")
                val view = params.optionalJsonObject("view")
                RpcAction { handleStatusUpdate(slotName, view) }
            }
            .on("notifier/showInfo") { params ->
                val message = params.string("message")
                RpcAction { notifications.showInfo(message) }
            }
            .on("notifier/showWarning") { params ->
                val message = params.string("message")
                RpcAction { notifications.showWarning(message) }
            }
            .on("notifier/showError") { params ->
                val message = params.string("message")
                RpcAction { notifications.showError(message) }
            }
            .on("notifier/openConsole") { RpcAction { notifications.openLoggingConsole() } }
            .on("notifier/openDocument") { params ->
                val path = params.string("path")
                RpcAction { notifications.openDocument(path) }
            }
            .on("notifier/log") { params ->
                val level = params.optionalString("level")
                val message = params.optionalString("message").orEmpty()
                RpcAction { notifications.log(level, message) }
            }
            .on("notifier/progressStart") { params ->
                val title = params.optionalString("title").orEmpty()
                RpcAction { handleProgressStart(title) }
            }
            .on("notifier/progressEnd") { params ->
                val title = params.optionalString("title").orEmpty()
                RpcAction { handleProgressEnd(title) }
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
    private fun handleStatusUpdate(slotName: String?, view: JsonObject?) {
        val slot = slotName?.let { wireValueOf<StatusSlot>(it) }
        if (slot == null) {
            log.warn("statusBar/update: no placement for status slot '$slotName'")
            return
        }
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

    private fun readConfirm(params: RpcParams): RpcAction {
        val title = params.optionalString("title").orEmpty()
        val confirmLabel = params.optionalString("confirmLabel") ?: "Continue"
        val details = params.optionalJsonArray("details")?.map { it.asString }.orEmpty()
        return RpcAction { id -> if (id != null) handleConfirm(title, confirmLabel, details, id) }
    }

    /**
     * Modal yes/no listing what is about to be removed.
     *
     * Every path that cannot ask replies `false`: a disposed project or a
     * missing reply id must never be read as consent to delete.
     */
    private fun handleConfirm(title: String, confirmLabel: String, details: List<String>, id: Int) {
        deps.channel.replyFromEdt(id, "confirm/show") {
            if (project.isDisposed) return@replyFromEdt ConfirmShowResult(confirmed = false)
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
            ConfirmShowResult(confirmed = choice == Messages.YES)
        }
    }

    private fun readPick(params: RpcParams): RpcAction {
        val title = params.optionalString("title")
        val placeholder = params.optionalString("placeholder").orEmpty()
        val canPickMany = params.optionalBoolean("canPickMany") ?: false
        val items =
            params.jsonArray("items").mapIndexed { index, element ->
                val obj = element.asJsonObject
                HostPicker.PickItem(
                    index,
                    obj.get("label").asString,
                    obj.optionalString("description"),
                )
            }
        // A picker prompt is always a request expecting a reply; a missing id
        // would mean nothing to answer, so there is nothing to do.
        return RpcAction { id -> if (id != null) handlePick(title, placeholder, canPickMany, items, id) }
    }

    /**
     * Shows a native list popup for the core's `PickerPort` and replies with the
     * chosen item indices, or `null` on dismissal. The host renders only the
     * chooser; the cancel-vs-throw convention is applied core-side.
     */
    private fun handlePick(
        title: String?,
        placeholder: String,
        canPickMany: Boolean,
        items: List<HostPicker.PickItem>,
        id: Int,
    ) {
        deps.channel.replyLaterFromEdt(id, "picker/show") { reply ->
            if (project.isDisposed) {
                reply.result(PickerShowResult(selected = null))
                return@replyLaterFromEdt
            }
            HostPicker.show(project, title, placeholder, canPickMany, items) { selected ->
                reply.result(PickerShowResult(selected))
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
            ClipboardReadResult(text)
        }
    }

    /** Writes the webview's copied text onto the system clipboard (fire-and-forget). */
    private fun handleClipboardWrite(text: String) {
        ApplicationManager.getApplication().invokeLater {
            CopyPasteManager.getInstance().setContents(StringSelection(text))
        }
    }

    private fun JsonObject.optionalString(key: String): String? = get(key)?.takeIf { !it.isJsonNull }?.asString

    private fun JsonObject.optionalBoolean(key: String): Boolean? = get(key)?.takeIf { !it.isJsonNull }?.asBoolean
}
