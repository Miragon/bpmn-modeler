package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBuilder
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.ExecutorService
import java.util.concurrent.atomic.AtomicBoolean

private val log = Logger.getInstance("io.miragon.intellij.bpmn.ModelerBrowsers")

/**
 * Builds every JCEF browser the plugin renders webviews in — the single place the
 * off-screen framerate is set.
 *
 * **Why the framerate override.** CEF's windowless (off-screen) default is 30 fps,
 * and every current plugin browser runs off-screen: `JBCefApp` forces OSR on the
 * 2025+/2026 IDEs (remote/out-of-process CEF), and the no-arg `JBCefBrowser()` we
 * used before defaulted to OSR anyway. `setWindowlessFramerate` only affects OSR
 * mode, so it is exactly the knob that matters here; 60 fps halves the frame
 * interval that made canvas interactions feel "one behind" on Windows. We do *not*
 * try to disable OSR — under remote CEF `setOffScreenRendering(false)` is ignored,
 * the `ide.browser.jcef.osr.enabled=false` registry flag makes the ctor throw while
 * remote CEF is active, and with remote CEF off, windowed rendering measured no
 * better than in-process OSR at this framerate.
 *
 * The builder does not create the native browser immediately (callers that need
 * that, e.g. [WarmBrowser], call `createImmediately()` themselves), so it is a
 * drop-in for the former `JBCefBrowser()` construction.
 */
fun createModelerBrowser(): JBCefBrowser = JBCefBrowserBuilder().setWindowlessFramerate(60).build()

/**
 * Single-thread executor that drains JS→JVM webview messages off the CEF UI
 * thread. That thread also delivers OSR `onPaint`, so parsing/serialising JSON on
 * it directly competes with frame delivery — the root of the sluggish canvas. One
 * bounded thread is mandatory, not incidental: `SyncDocumentCommand`s carry the
 * document state and must stay FIFO, so they can never be reordered by a wider
 * pool. Shared across the editor, diff, and deployment browsers.
 */
val webviewForwardExecutor: ExecutorService =
    AppExecutorUtil.createBoundedApplicationPoolExecutor("modeler-webview-forward", 1)

/**
 * True when this IDE runs JCEF out-of-process ("remote" CEF). Reflective because
 * `JBCefApp.isRemoteEnabled()` is package-private; the platform itself resolves the
 * underlying CEF method reflectively. Any failure (older SDK, CEF not initialised)
 * is treated as in-process, so the mitigation notice never fires spuriously.
 */
fun isOutOfProcessJcef(): Boolean =
    runCatching {
        Class.forName("org.cef.CefApp").getMethod("isRemoteEnabled").invoke(null) as Boolean
    }.getOrDefault(false)

// Shows the out-of-process notice at most once per IDE run even before the user
// dismisses it, so opening a batch of `.bpmn` files does not surface a balloon per
// tab. The persistent flag below still suppresses it across restarts once dismissed.
private val outOfProcessNoticeShown = AtomicBoolean(false)

private const val OOP_JCEF_NOTICE_DISMISSED = "io.miragon.bpmn-modeler.oopJcefNoticeDismissed"

/**
 * Surfaces the out-of-process-JCEF sluggishness once, with the concrete fix and a
 * "Don't show again" opt-out, when a modeler opens on an affected setup.
 *
 * Scoped to Windows because that is where the remote-CEF OSR pipeline visibly
 * drops/delays frames (the canvas feels "one interaction behind"). The advertised
 * fix is the registry key `ide.browser.jcef.out-of-process.enabled` — the platform's
 * master switch for remote CEF. The documented `-Djcef.remote.enabled=false` VM
 * option is NOT offered: on 2026.1 (IU-261) it was observed to have no effect
 * (remote mode stayed active and browsers still resolved as remote-OSR).
 * Self-cancelling: once the user disables the registry key, [isOutOfProcessJcef]
 * returns false and this never fires again — so the persistent flag is only needed
 * for the user who chooses to live with it.
 */
fun maybeNotifyOutOfProcessJcef(project: Project) {
    if (!SystemInfo.isWindows || !isOutOfProcessJcef()) return
    val props = PropertiesComponent.getInstance()
    if (props.getBoolean(OOP_JCEF_NOTICE_DISMISSED, false)) return
    if (!outOfProcessNoticeShown.compareAndSet(false, true)) return

    val notification =
        NotificationGroupManager.getInstance()
            .getNotificationGroup(MODELER_NOTIFICATION_GROUP)
            .createNotification(
                "BPMN modeler rendering may lag",
                "This IDE runs embedded Chromium (JCEF) out-of-process, which can make the diagram " +
                    "canvas feel one interaction behind on Windows. To fix it, open " +
                    "<b>Help → Find Action → \"Registry…\"</b>, disable " +
                    "<code>ide.browser.jcef.out-of-process.enabled</code>, and restart the IDE.",
                NotificationType.INFORMATION,
            )
    notification.addAction(
        NotificationAction.createSimpleExpiring("Don't show again") {
            props.setValue(OOP_JCEF_NOTICE_DISMISSED, true)
        },
    )
    notification.notify(project)
}

// Must match the <notificationGroup id="…"> registered in plugin.xml (shared with
// HostNotifications' balloons).
private const val MODELER_NOTIFICATION_GROUP = "Miragon BPMN Modeler"
