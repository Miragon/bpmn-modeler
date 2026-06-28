package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefApp
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
 * The browser comes pre-loaded from [BrowserPrewarmService] so the open path
 * skips the cold spawn + bundle fetch + bpmn-js init; this editor only binds it
 * to the core session ([WarmBrowser.bind]).
 *
 * Pipes:
 *  - assets are served by the shared [WebviewServer] over loopback HTTP;
 *  - JS → JVM uses the [WarmBrowser]'s `JBCefJSQuery`; the page's shim buffers
 *    outgoing messages and flushes once the sink is injected at bind;
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
            // Take a pre-warmed browser (already loaded with the bpmn-js page) so
            // the open path skips the cold spawn + bundle fetch + bpmn-js init.
            // Ownership transfers here: parented to this editor, disposed on close.
            val warm = project.service<BrowserPrewarmService>().take()
            component = warm.browser.component
            Disposer.register(this, warm)

            // The editor id must match the core's session key (scheme-qualified URI).
            val editorId = file.url
            val coreSession =
                CoreSession(editorId, file, project) { json ->
                    // JSON is a valid JS object-literal expression; embed it directly.
                    warm.browser.cefBrowser.executeJavaScript(
                        "window.postMessage($json, '*');",
                        warm.browser.cefBrowser.url,
                        0,
                    )
                }
            session = coreSession

            // Register before binding the browser so the core has the session ready
            // when bind() flushes the webview's first (buffered) GetBpmnFileCommand.
            coreProcess!!.registerSession(coreSession)

            // Mirror the live IntelliJ Document into the core so external edits
            // (git revert/checkout, the plain-text tab, another tool) re-render the
            // diagram. The core's own write-backs also fire this — that echo is
            // filtered in the bridge, not here. Parented to this editor, so the
            // listener is removed when the tab closes.
            FileDocumentManager.getInstance().getDocument(file)?.addDocumentListener(
                object : DocumentListener {
                    override fun documentChanged(event: DocumentEvent) {
                        coreProcess.notifyDocumentChanged(editorId, event.document.text)
                    }
                },
                this,
            )

            // Follow the IDE color theme: push a theme update into the page on
            // every LaF / editor-scheme change so `automatic` colorTheme tracks
            // the IDE live. Parented to this editor, so the callback is removed
            // when the tab closes.
            service<IdeThemeSignal>().follow(this, warm.browser.cefBrowser)

            // Wire the JS→JVM forwarder and inject the sink; this flushes the
            // buffered GetBpmnFileCommand, which now reaches the registered session.
            warm.bind { request -> coreProcess.forwardWebviewMessage(editorId, request) }
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
