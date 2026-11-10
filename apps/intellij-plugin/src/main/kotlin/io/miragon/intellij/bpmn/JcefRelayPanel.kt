package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import javax.swing.JComponent

/**
 * One tool window page in a JCEF browser that relays its messages verbatim, with
 * no protocol logic in Kotlin: what the page posts goes to [forward], and [post]
 * delivers the core's messages into it. The browser, its query and the theme
 * follow live as long as [parent].
 */
internal class JcefRelayPanel(
    parent: Disposable,
    private val applyThemeJs: () -> String,
    forward: (String) -> Unit,
) {
    private val browser = createModelerBrowser()

    val component: JComponent get() = browser.component

    init {
        Disposer.register(parent, browser)
        service<IdeThemeSignal>().follow(parent, browser.cefBrowser, applyThemeJs)

        val jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        Disposer.register(browser, jsQuery)
        jsQuery.addHandler { request ->
            // Off the CEF UI thread, which also delivers OSR onPaint.
            webviewForwardExecutor.execute { forward(request) }
            null
        }

        // The page's shim buffers its posts until this sink exists, so the order
        // of onLoadEnd and the page's own load handler does not matter.
        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    if (!frame.isMain) return
                    b.executeJavaScript(WebviewSinkScript.install(jsQuery.funcName), b.url, 0)
                    // The shell bakes in the theme of its request; a change racing the load is applied here.
                    b.executeJavaScript(applyThemeJs(), b.url, 0)
                }
            },
            browser.cefBrowser,
        )
    }

    fun load(url: String) = browser.loadURL(url)

    /** JSON is a valid JS expression, so the message embeds directly. */
    fun post(json: String) = browser.cefBrowser.executeJavaScript("window.postMessage($json, '*');", browser.cefBrowser.url, 0)

    fun reload() = browser.cefBrowser.reload()
}
