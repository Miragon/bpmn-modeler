package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.util.Computable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.jcef.JBCefApp
import org.cef.browser.CefBrowser
import java.beans.PropertyChangeListener
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * The read-only preview half of a template's split editor. It runs the bpmn
 * bundle's preview page without a bridge session: the page asks for the file
 * once, and this editor pushes every later edit and language switch.
 */
class ElementTemplatePreviewEditor(private val file: VirtualFile) : UserDataHolderBase(), FileEditor {
    private val log = Logger.getInstance(ElementTemplatePreviewEditor::class.java)

    private val document = FileDocumentManager.getInstance().getDocument(file)

    private var browser: CefBrowser? = null

    @Volatile
    private var locale = ModelerSettingsStore.getInstance().current().language

    private val component: JComponent =
        if (!JBCefApp.isSupported()) {
            unavailableLabel("JCEF (embedded Chromium) is not available in this IDE.")
        } else {
            try {
                buildPreview()
            } catch (e: Throwable) {
                log.warn("Failed to create the element template preview", e)
                unavailableLabel("The preview could not start: ${e.message ?: e.javaClass.simpleName}")
            }
        }

    private fun buildPreview(): JComponent {
        val page = WarmBrowser(service<WebviewServer>().templatePreviewUrl())
        Disposer.register(this, page)
        browser = page.browser.cefBrowser

        document?.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    post(ElementTemplatePreviewMessages.fileQuery(event.document.text, locale))
                }
            },
            this,
        )
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ModelerSettingsListener.TOPIC,
            ModelerSettingsListener {
                val language = ModelerSettingsStore.getInstance().current().language
                if (language != locale) {
                    locale = language
                    post(ElementTemplatePreviewMessages.languageQuery(language))
                }
            },
        )
        service<IdeThemeSignal>().follow(this, page.browser.cefBrowser)
        page.bind(::onPageMessage)
        return page.browser.component
    }

    private fun onPageMessage(json: String) {
        val message = ElementTemplatePreviewMessages.parse(json) ?: return
        when (message.type) {
            ElementTemplatePreviewMessages.GET_FILE ->
                post(ElementTemplatePreviewMessages.fileQuery(currentText(), locale))
            "LogErrorCommand" -> log.warn("Element template preview: ${message.log}")
            else -> log.debug("Element template preview: ${message.type} ${message.log.orEmpty()}")
        }
    }

    private fun currentText(): String =
        ApplicationManager.getApplication().runReadAction(
            Computable { document?.text ?: String(file.contentsToByteArray(), file.charset) },
        )

    private fun post(json: String) {
        val cef = browser ?: return
        // JSON is a valid JS object-literal expression; embed it directly.
        cef.executeJavaScript("window.postMessage($json, '*');", cef.url, 0)
    }

    private fun unavailableLabel(text: String): JComponent = JLabel(text, SwingConstants.CENTER)

    override fun getComponent(): JComponent = component

    override fun getPreferredFocusedComponent(): JComponent = component

    override fun getName(): String = "Preview"

    override fun getFile(): VirtualFile = file

    override fun setState(state: FileEditorState) = Unit

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = file.isValid

    override fun addPropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun removePropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun dispose() = Unit
}
