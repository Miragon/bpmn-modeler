package io.miragon.intellij.bpmn

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem

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
class HostNotifications(private val project: Project) {
    private val log = Logger.getInstance(HostNotifications::class.java)

    private val group
        get() = NotificationGroupManager.getInstance().getNotificationGroup(GROUP_ID)

    fun showInfo(message: String) = balloon(message, NotificationType.INFORMATION)

    fun showError(message: String) = balloon(message, NotificationType.ERROR)

    fun notifyError(context: String, message: String) =
        balloon("$context\n$message", NotificationType.ERROR)

    fun log(level: String?, message: String) {
        val text = "[webview] $message"
        when (level) {
            "error" -> log.warn(text)
            "warn" -> log.warn(text)
            else -> log.info(text)
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
    }
}
