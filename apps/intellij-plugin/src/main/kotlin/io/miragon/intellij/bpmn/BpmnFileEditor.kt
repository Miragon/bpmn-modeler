package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.ui.jcef.JcefShortcutProvider
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.beans.PropertyChangeListener
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * JCEF-backed editor that renders a `.bpmn` file with the bpmn-js webview,
 * driven by the **out-of-process modeler core** ([CoreProcess]).
 *
 * This editor is deliberately dumb: it owns the browser and the message pipes,
 * but no protocol logic. Every webview message is forwarded verbatim to the
 * core, and every core→webview message is pushed straight into the page. The
 * actual BPMN handling (engine detection, render, document sync) happens in the
 * shared TypeScript core, which needs no Kotlin reimplementation.
 *
 * Pipes:
 *  - assets are served by the shared [WebviewServer] over loopback HTTP;
 *  - JS → JVM uses a [JBCefJSQuery]; the page's shim buffers outgoing messages
 *    and flushes once the sink is injected on load end;
 *  - JVM → JS uses `window.postMessage`, the channel the webview listens on.
 */
class BpmnFileEditor(
    private val project: Project,
    private val file: VirtualFile,
) : UserDataHolderBase(), FileEditor {
    private val component: JComponent

    // The core is a project-level service: one supervised bridge per project
    // window, torn down deterministically when the project closes.
    private val coreProcess: CoreProcess? =
        if (JBCefApp.isSupported()) project.service<CoreProcess>() else null
    private val session: CoreSession?

    init {
        if (!JBCefApp.isSupported()) {
            session = null
            component =
                JLabel(
                    "<html><center>JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.</center></html>",
                    SwingConstants.CENTER,
                )
        } else {
            val cefBrowser = JBCefBrowser()
            component = cefBrowser.component
            Disposer.register(this, cefBrowser)

            // macOS only: JBCefBrowser registers IDE actions ($SelectAll/$Undo/
            // $Redo/$Copy/$Paste/$Cut) on this component that hijack ⌘-shortcuts
            // and route them to *native* CEF frame commands (CefFrame.selectAll/
            // undo/…), which only act on focused text fields. bpmn-js is a canvas
            // app, so ⌘A/⌘Z silently no-op there — while Ctrl+A/Ctrl+Z work,
            // because Ctrl isn't bound in the macOS keymap so its keydown reaches
            // the page and bpmn-js's own keyboard bindings (isCmd = ctrl||meta)
            // fire. Unregistering the forwarders lets ⌘-keystrokes fall through to
            // the webview exactly like Ctrl, restoring select-all/undo/redo/copy/
            // paste. No-op off macOS, where the forwarders are never registered.
            runCatching {
                JcefShortcutProvider.getActions().forEach {
                    it.second.unregisterCustomShortcutSet(cefBrowser.component)
                }
            }

            // The editor id must match the core's session key (scheme-qualified URI).
            val editorId = file.url
            val coreSession =
                CoreSession(editorId, file, project) { json ->
                    // JSON is a valid JS object-literal expression; embed it directly.
                    cefBrowser.cefBrowser.executeJavaScript(
                        "window.postMessage($json, '*');",
                        cefBrowser.cefBrowser.url,
                        0,
                    )
                }
            session = coreSession

            // Register before the page loads so the core has the session ready by
            // the time the webview's first (buffered) message is forwarded.
            coreProcess!!.registerSession(coreSession)

            // JS → JVM channel: forward every webview message to the core untouched.
            val jsQuery = JBCefJSQuery.create(cefBrowser as com.intellij.ui.jcef.JBCefBrowserBase)
            Disposer.register(cefBrowser, jsQuery)
            jsQuery.addHandler { request ->
                coreProcess.forwardWebviewMessage(editorId, request)
                null
            }

            // Install the JVM sink only after the document is parsed; the shim's
            // buffered messages then flush. inject("p") emits the JS that ships the
            // string argument `p` back to the jsQuery handler.
            cefBrowser.jbCefClient.addLoadHandler(
                object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                        b.executeJavaScript(
                            "window.__miranumSetSink(function (p) { ${jsQuery.inject("p")} });",
                            b.url,
                            0,
                        )
                    }
                },
                cefBrowser.cefBrowser,
            )

            cefBrowser.loadURL(service<WebviewServer>().ensureStarted())
        }
    }

    override fun getComponent(): JComponent = component

    override fun getPreferredFocusedComponent(): JComponent = component

    override fun getName(): String = "BPMN Modeler"

    override fun getFile(): VirtualFile = file

    override fun setState(state: FileEditorState) = Unit

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun removePropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun dispose() {
        session?.let { coreProcess?.disposeSession(it.editorId) }
    }
}
