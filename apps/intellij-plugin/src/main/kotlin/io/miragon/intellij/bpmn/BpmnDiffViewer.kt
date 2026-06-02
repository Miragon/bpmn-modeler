package io.miragon.intellij.bpmn

import com.intellij.diff.FrameDiffTool
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.contents.FileContent
import com.intellij.diff.requests.ContentDiffRequest
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.components.service
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.ui.JBSplitter
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.util.UUID
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * Two-pane BPMN diff rendered with the real bpmn-js viewer, driven by the
 * **out-of-process modeler core** ([CoreProcess]).
 *
 * This is the spike's hardest claim made concrete: a diff is *host-originated*
 * (IntelliJ opens it with both sides known up front) and coordinates **two**
 * JCEF browsers as one logical unit. Yet this viewer carries no diff logic —
 * it forwards each pane's webview messages to the core and pushes core replies
 * back into the matching browser. The differ ([BpmnDiffService] +
 * `bpmn-js-differ`) runs entirely in the shared TypeScript core.
 *
 * Pane identity ([deriveUri]) is the key wrinkle: VCS diff contents both point
 * at the same working-tree file for highlighting, so a `#before`/`#after`
 * fragment is appended to keep the two sides distinct in the core's
 * `DiffSession`. The diff legend strips the fragment, so the real filename
 * still shows.
 */
class BpmnDiffViewer(
    private val request: ContentDiffRequest,
) : FrameDiffTool.DiffViewer {
    private val coreProcess: CoreProcess? = if (JBCefApp.isSupported()) service<CoreProcess>() else null

    // Matches the core's diff session key across open/dispose. Process-unique is
    // enough — it never leaves this host.
    private val diffId = "diff-${UUID.randomUUID()}"

    private val ownDisposable = Disposer.newDisposable("BpmnDiffViewer")
    private val rootComponent: JComponent

    // Captured in the constructor (when the component tree is built) and acted on
    // in init(), which is the EDT lifecycle point where heavy work belongs.
    private var startSession: (() -> Unit)? = null

    init {
        if (coreProcess == null) {
            rootComponent =
                JLabel(
                    "<html><center>JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.</center></html>",
                    SwingConstants.CENTER,
                )
        } else {
            val before = request.contents[0]
            val after = request.contents[1]
            val beforeUri = deriveUri(before, "before")
            val afterUri = deriveUri(after, "after")
            val beforeText = textOf(before)
            val afterText = textOf(after)
            // Two distinct working files → user-initiated Compare Files; a shared
            // (or missing) file → a VCS revision diff. Origin only drives the
            // legend's compare-files chrome, so a heuristic is sufficient.
            val origin =
                if (baseUrlOf(before) != null && baseUrlOf(before) != baseUrlOf(after)) {
                    "compare-files"
                } else {
                    "scm"
                }

            val beforePane = createPane(beforeUri)
            val afterPane = createPane(afterUri)

            val splitter = JBSplitter(false, 0.5f)
            splitter.firstComponent = beforePane.component
            splitter.secondComponent = afterPane.component
            rootComponent = splitter

            startSession = {
                // Register the session before the pages load: each webview emits
                // GetBpmnFileCommand as soon as its scripts run, and the core must
                // already know the pane to answer with viewer-mode XML.
                coreProcess.openDiff(
                    diffId,
                    origin,
                    beforeUri,
                    beforeText,
                    beforePane.post,
                    afterUri,
                    afterText,
                    afterPane.post,
                )
                beforePane.load()
                afterPane.load()
            }
        }
    }

    override fun getComponent(): JComponent = rootComponent

    override fun getPreferredFocusedComponent(): JComponent = rootComponent

    override fun init(): FrameDiffTool.ToolbarComponents {
        startSession?.invoke()
        return FrameDiffTool.ToolbarComponents()
    }

    override fun dispose() {
        coreProcess?.disposeDiff(diffId)
        Disposer.dispose(ownDisposable)
    }

    /** One JCEF pane plus the host-side message pipes, mirroring [BpmnFileEditor]. */
    private class Pane(
        val component: JComponent,
        val post: (String) -> Unit,
        val load: () -> Unit,
    )

    /**
     * Builds a JCEF browser for one diff side and wires both message pipes:
     * JS → JVM via [JBCefJSQuery] (forwarded to the core under `paneUri`), and
     * JVM → JS via `window.postMessage`. Loading is deferred to [Pane.load] so
     * the core session exists before the page's first buffered message flushes.
     */
    private fun createPane(paneUri: String): Pane {
        val browser = JBCefBrowser()
        Disposer.register(ownDisposable, browser)

        val post: (String) -> Unit = { json ->
            // JSON is a valid JS object-literal expression; embed it directly.
            browser.cefBrowser.executeJavaScript("window.postMessage($json, '*');", browser.cefBrowser.url, 0)
        }

        val jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        Disposer.register(browser, jsQuery)
        jsQuery.addHandler { message ->
            coreProcess?.forwardDiffMessage(paneUri, message)
            null
        }

        // Install the JVM sink only after the page parses, so the shim's buffered
        // messages flush into a handler that exists.
        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    b.executeJavaScript(
                        "window.__miranumSetSink(function (p) { ${jsQuery.inject("p")} });",
                        b.url,
                        0,
                    )
                }
            },
            browser.cefBrowser,
        )

        return Pane(browser.component, post) { browser.loadURL(service<WebviewServer>().ensureStarted()) }
    }

    /**
     * Stable per-side identity. A `#before`/`#after` fragment keeps the two
     * sides distinct even when both contents resolve to the same working-tree
     * file (the usual VCS case); `basenameOfUriString` in the core strips it.
     */
    private fun deriveUri(content: DiffContent, side: String): String =
        "${baseUrlOf(content) ?: "diff:///pane"}#$side"

    private fun baseUrlOf(content: DiffContent): String? =
        when (content) {
            is DocumentContent -> content.highlightFile?.url
            is FileContent -> content.file.url
            else -> null
        }

    /** Reads a side's text under a read action (Document access requires it). */
    private fun textOf(content: DiffContent): String =
        ReadAction.compute<String, RuntimeException> {
            (content as? DocumentContent)?.document?.text.orEmpty()
        }
}
