package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
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
 * JCEF-backed editor that renders a `.dmn` file with the dmn-js webview, driven
 * by the out-of-process modeler core ([CoreProcess]). The DMN twin of
 * [BpmnFileEditor]: the wiring is identical (register session → mirror the
 * Document → follow the IDE theme → bind the JS↔JVM pipes), only the session
 * [ModelerKind] and the loaded shell differ.
 *
 * Unlike BPMN it does **not** draw from [BrowserPrewarmService]: a `.dmn` tab is
 * opened rarely enough that keeping a second warm browser per project isn't
 * worth the idle cost, so the DMN browser is built cold here on the open path.
 */
class DmnFileEditor(
    private val project: Project,
    private val file: VirtualFile,
) : UserDataHolderBase(), FileEditor {
    private val log = Logger.getInstance(DmnFileEditor::class.java)

    private val component: JComponent

    private val coreProcess: CoreProcess? =
        if (JBCefApp.isSupported()) project.service<CoreProcess>() else null
    private var session: CoreSession? = null

    init {
        component =
            if (!JBCefApp.isSupported()) {
                unavailableLabel(
                    "JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.",
                )
            } else {
                try {
                    buildBrowserEditor()
                } catch (e: Throwable) {
                    // A throwing JCEF ctor (e.g. ide.browser.jcef.osr.enabled=false)
                    // must surface as the unavailable label, not a silent drop to the
                    // plain-text tab — see BpmnFileEditor for the full rationale.
                    log.warn("Failed to create the DMN modeler browser", e)
                    unavailableLabel(
                        "The DMN modeler could not start in this IDE.<br>" +
                            "Details: ${e.message ?: e.javaClass.simpleName}",
                    )
                }
            }
    }

    /**
     * Builds the JCEF-backed DMN editor and wires it to the core. Extracted so its
     * failure (a throwing browser ctor) is caught in [init] and turned into the
     * unavailable-editor label rather than a silent XML-tab fallback.
     */
    private fun buildBrowserEditor(): JComponent {
        // Cold-build a browser loaded with the DMN shell (dedicated loopback
        // origin). Parented to this editor, disposed on close.
        val warm = WarmBrowser(service<WebviewServer>().dmnUrl())
        Disposer.register(this, warm)

        // The editor id must match the core's session key (scheme-qualified URI).
        val editorId = file.url
        val coreSession =
            CoreSession(editorId, file, project, ModelerKind.DMN) { json ->
                warm.browser.cefBrowser.executeJavaScript(
                    "window.postMessage($json, '*');",
                    warm.browser.cefBrowser.url,
                    0,
                )
            }
        // Publish before registering so dispose() can tear it down even if a later
        // wiring step throws after registration.
        session = coreSession

        // Register before binding the browser so the core has the session ready
        // when bind() flushes the webview's first (buffered) GetDmnFileCommand.
        coreProcess!!.registerSession(coreSession)

        // Mirror the live IntelliJ Document into the core so external edits
        // (git revert/checkout, the plain-text tab, another tool) re-render the
        // diagram. The core's own write-backs also fire this — that echo is
        // filtered in the bridge, not here. Parented to this editor.
        FileDocumentManager.getInstance().getDocument(file)?.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    coreProcess.notifyDocumentChanged(editorId, event.document.text)
                }
            },
            this,
        )

        // Follow the IDE color theme live, same as the BPMN editor.
        service<IdeThemeSignal>().follow(this, warm.browser.cefBrowser)

        // Wire the JS→JVM forwarder and inject the sink; this flushes the buffered
        // GetDmnFileCommand, which now reaches the registered session.
        warm.bind { request -> coreProcess.forwardWebviewMessage(editorId, request) }

        maybeNotifyOutOfProcessJcef(project)

        return warm.browser.component
    }

    private fun unavailableLabel(htmlBody: String): JComponent =
        JLabel("<html><center>$htmlBody</center></html>", SwingConstants.CENTER)

    override fun getComponent(): JComponent = component

    override fun getPreferredFocusedComponent(): JComponent = component

    override fun getName(): String = "DMN Modeler"

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
