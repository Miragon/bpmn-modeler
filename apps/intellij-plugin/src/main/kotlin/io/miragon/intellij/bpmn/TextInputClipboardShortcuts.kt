package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame

/**
 * Restores ⌘X/⌘C/⌘V in the page's `<input>`/`<textarea>` fields on macOS.
 *
 * Off-screen CEF on macOS has no menu responder chain, so Blink never turns ⌘C/⌘V
 * into clipboard commands; only native frame commands do. The platform's
 * `JcefShortcutProvider` issues them unconditionally, which starves the canvas, so
 * [WarmBrowser] drops it. These replacements claim the keystroke only while a native
 * text input is focused and otherwise let it fall through to the page, keeping
 * canvas copy/paste and the contenteditable clipboard polyfill untouched.
 *
 * Must be constructed before the browser's `createImmediately()`: the focus query's
 * message router only binds if registered before the render process starts.
 */
class TextInputClipboardShortcuts(private val browser: JBCefBrowser) {
    // Written from the CEF query thread, read by action updates on a BGT thread.
    @Volatile
    private var nativeTextInputFocused = false

    private val focusQuery: JBCefJSQuery? =
        if (SystemInfo.isMac) JBCefJSQuery.create(browser as JBCefBrowserBase) else null

    init {
        focusQuery?.let { query ->
            Disposer.register(browser, query)
            query.addHandler { focused ->
                nativeTextInputFocused = focused == "1"
                null
            }
            registerFrameCommand("\$Cut") { it.cut() }
            registerFrameCommand("\$Copy") { it.copy() }
            registerFrameCommand("\$Paste") { it.paste() }
        }
    }

    // focusout reads relatedTarget because activeElement is not yet the new focus owner.
    fun installFocusTracking(cefBrowser: CefBrowser) {
        val query = focusQuery ?: return
        val js =
            """
            (function () {
                function report(el) {
                    var focused = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? "1" : "0";
                    ${query.inject("focused")}
                }
                document.addEventListener("focusin", function (e) { report(e.target); }, true);
                document.addEventListener("focusout", function (e) { report(e.relatedTarget); }, true);
                report(document.activeElement);
            })();
            """.trimIndent()
        cefBrowser.executeJavaScript(js, cefBrowser.url, 0)
    }

    private fun registerFrameCommand(actionId: String, command: (CefFrame) -> Unit) {
        val action =
            object : DumbAwareAction() {
                override fun getActionUpdateThread() = ActionUpdateThread.BGT

                override fun update(e: AnActionEvent) {
                    e.presentation.isEnabled = nativeTextInputFocused
                }

                override fun actionPerformed(e: AnActionEvent) {
                    browser.cefBrowser.focusedFrame?.let(command)
                }
            }
        action.registerCustomShortcutSet(KeymapUtil.getActiveKeymapShortcuts(actionId), browser.component, browser)
    }
}
