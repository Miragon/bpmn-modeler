package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * The Camunda 7/8 **Deployment** tool window: a JCEF browser hosting the
 * deployment webview, driven by the out-of-process modeler core ([CoreProcess])
 * exactly like [BpmnFileEditor] drives the editor — verbatim message bridge, no
 * protocol logic in Kotlin. The deploy/start-instance brain is the shared
 * TypeScript `DeploymentMessageDispatcher`; this factory only owns the browser
 * and the two message pipes.
 *
 * One tool window per project (project-level [CoreProcess]); the dispatcher reads
 * "the active editor" to pre-fill the form, so the same bridge that renders the
 * `.bpmn` editors also serves this panel.
 */
class DeploymentToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val component =
            if (!JBCefApp.isSupported()) {
                JLabel(
                    "<html><center>JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.</center></html>",
                    SwingConstants.CENTER,
                )
            } else {
                buildBrowser(project, toolWindow)
            }
        val content = ContentFactory.getInstance().createContent(component, null, false)
        toolWindow.contentManager.addContent(content)
    }

    /**
     * Wires the JCEF browser to the core: JS→JVM via [JBCefJSQuery] (the page's
     * shim buffers outbound messages and flushes once the sink is injected on load
     * end), JVM→JS via `window.postMessage`. The core→webview sink and the
     * panel-open flag are registered/cleared with the tool window's lifetime.
     */
    private fun buildBrowser(project: Project, toolWindow: ToolWindow): JComponent {
        val coreProcess = project.service<CoreProcess>()
        val browser = JBCefBrowser()
        Disposer.register(toolWindow.disposable, browser)

        // JS → JVM: forward every deployment-webview message to the core untouched.
        val jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        Disposer.register(browser, jsQuery)
        jsQuery.addHandler { request ->
            coreProcess.forwardDeploymentMessage(request)
            null
        }

        // Register the core→webview sink: a `deployment/postMessage` from the core
        // becomes a `window.postMessage` into this page. JSON is a valid JS
        // object-literal expression, so it embeds directly.
        coreProcess.registerDeploymentWindow { json ->
            browser.cefBrowser.executeJavaScript(
                "window.postMessage($json, '*');",
                browser.cefBrowser.url,
                0,
            )
        }
        Disposer.register(toolWindow.disposable) { coreProcess.unregisterDeploymentWindow() }

        // Install the JVM sink only after the document is parsed; the shim's
        // buffered messages then flush.
        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    b.executeJavaScript(
                        "window.__modelerSetSink(function (p) { ${jsQuery.inject("p")} });",
                        b.url,
                        0,
                    )
                }
            },
            browser.cefBrowser,
        )

        // The content is created on first reveal, so the panel is open now; track
        // later show/hide so the core only refreshes form defaults while visible.
        coreProcess.setDeploymentOpen(true)
        subscribeToVisibility(project, toolWindow, coreProcess)

        browser.loadURL(service<WebviewServer>().deploymentUrl())
        return browser.component
    }

    /**
     * Mirrors the tool window's visibility into the core's panel-open flag, so the
     * dispatcher refreshes the form on active-editor changes only while shown.
     * De-duplicates events to avoid re-pushing defaults on unrelated state changes.
     */
    private fun subscribeToVisibility(
        project: Project,
        toolWindow: ToolWindow,
        coreProcess: CoreProcess,
    ) {
        var lastVisible = true
        project.messageBus.connect(toolWindow.disposable).subscribe(
            ToolWindowManagerListener.TOPIC,
            object : ToolWindowManagerListener {
                override fun stateChanged(toolWindowManager: ToolWindowManager) {
                    val visible =
                        toolWindowManager.getToolWindow(TOOL_WINDOW_ID)?.isVisible ?: false
                    if (visible != lastVisible) {
                        lastVisible = visible
                        coreProcess.setDeploymentOpen(visible)
                    }
                }
            },
        )
    }

    companion object {
        const val TOOL_WINDOW_ID = "Miragon Deployment"
    }
}
