package io.miragon.intellij.bpmn

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Drives the core's `NotifierPort` against real IntelliJ UI: balloons via
 * `Notifications.Bus` for the user-facing methods and the IDE log for the
 * diagnostic ones.
 *
 * Scoped to a [project] so balloons attach to the originating window and
 * `openDocument` opens in the right editor manager. The core decides *what* to
 * say (over the `notifier/…` RPC methods); this decides *how* IntelliJ shows it — the same
 * split the VS Code `VsCodeNotifier` makes against `window.show*Message`.
 */
class HostNotifications(
    private val project: Project,
    private val log: Logger = Logger.getInstance(HostNotifications::class.java),
) {
    private val group
        get() = NotificationGroupManager.getInstance().getNotificationGroup(GROUP_ID)

    fun showInfo(message: String) = balloon(message, NotificationType.INFORMATION)

    fun showWarning(message: String) = balloon(message, NotificationType.WARNING)

    fun showError(message: String) = balloon(message, NotificationType.ERROR)

    /**
     * The core's action notice as a notification with one action per label.
     * [answer] gets the chosen label's index, or null once the notice expires
     * unanswered (cleared from the Notifications tool window); a balloon closed
     * with its X stays there and can still be answered. It answers at most once.
     */
    fun actionNotice(tone: ActionNoticeTone, message: String, labels: List<String>, answer: (Int?) -> Unit): Notification {
        val answered = AtomicBoolean(false)
        val answerOnce = { choice: Int? -> if (answered.compareAndSet(false, true)) answer(choice) }
        val notification = Notification(GROUP_ID, message, NOTIFICATION_TYPES.getValue(tone))
        labels.forEachIndexed { index, label ->
            notification.addAction(
                NotificationAction.create(label) { _, clicked ->
                    answerOnce(index)
                    clicked.expire()
                },
            )
        }
        return notification.whenExpired { answerOnce(null) }
    }

    /** Shows [actionNotice] in this project's window and returns what expires it from any thread. */
    fun offer(tone: ActionNoticeTone, message: String, labels: List<String>, answer: (Int?) -> Unit): () -> Unit {
        val notice = actionNotice(tone, message, labels, answer)
        notice.notify(project)
        return { ApplicationManager.getApplication().invokeLater(notice::expire, ModalityState.any()) }
    }

    /** The core already tags a line a webview forwarded, so [message] is written as it came. */
    fun log(level: String?, message: String) {
        when (level) {
            "error" -> log.warn(message)
            "warn" -> log.warn(message)
            "debug" -> log.debug(message)
            else -> log.info(message)
        }
    }

    /**
     * The IDE has no per-plugin console; surface the diagnostics that matter as
     * a balloon and keep the full trail in `idea.log`. A dedicated tool-window
     * console is deferred — none of the foundation's flows need it.
     */
    fun openLoggingConsole() = log.info("openLoggingConsole requested (see idea.log)")

    fun openDocument(absolutePath: String) {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            val file = LocalFileSystem.getInstance().findFileByPath(absolutePath)
            if (file != null) {
                FileEditorManager.getInstance(project).openFile(file, true)
            } else {
                log.warn("openDocument: file not found at $absolutePath")
            }
        }
    }

    private fun balloon(content: String, type: NotificationType) {
        ApplicationManager.getApplication().invokeLater {
            if (!project.isDisposed) {
                group.createNotification(content, type).notify(project)
            }
        }
    }

    private companion object {
        // Must match the <notificationGroup id="…"> registered in plugin.xml.
        const val GROUP_ID = "Miragon BPMN Modeler"

        val NOTIFICATION_TYPES =
            mapOf(ActionNoticeTone.INFO to NotificationType.INFORMATION, ActionNoticeTone.WARNING to NotificationType.WARNING)
    }
}
