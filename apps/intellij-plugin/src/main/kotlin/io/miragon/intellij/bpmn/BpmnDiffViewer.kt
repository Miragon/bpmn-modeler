package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.contents.DocumentContent
import com.intellij.diff.contents.FileContent
import com.intellij.diff.requests.ContentDiffRequest
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Computable
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBSplitter
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.nio.charset.StandardCharsets
import java.util.UUID
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.SwingConstants

/**
 * Two-pane BPMN diff rendered with the real bpmn-js viewer, driven by the
 * **out-of-process modeler core** ([CoreProcess]).
 *
 * A diff is *host-originated* (IntelliJ opens it with both sides known up front)
 * and coordinates **two** JCEF browsers as one logical unit. Yet this viewer
 * carries no diff logic — it forwards each pane's webview messages to the core
 * and pushes core replies back into the matching browser. The differ
 * ([BpmnDiffService] + `bpmn-js-differ`) runs entirely in the shared TypeScript
 * core. The one exception is **swap-sides** (see [swap]): swapping recreates the
 * two panes, a host/lifecycle concern, so it is handled here rather than in the
 * vscode-free core — mirroring how VS Code keeps swap in `BpmnDiffController`.
 *
 * **Pane identity** ([uriFor]) is the key wrinkle: a `#<diffId>-<role>` fragment
 * is appended to each side's file URL so that (a) the two sides stay distinct
 * even when both VCS contents point at the same working-tree file, and (b) two
 * simultaneous diffs of the *same* file never collide in the core's routing
 * tables. `basenameOfUriString` in the core strips the fragment, so the legend
 * still shows the real filename.
 *
 * **Crash recovery note:** diff panes are host-originated and their XML is held
 * here (not in the core's document mirror), so a mid-diff bridge respawn does
 * **not** auto-recover the diff — `EditorSessionRouter.reregisterLiveSessions` covers
 * editor sessions only. A diff tab is transient and re-openable, so this is an
 * accepted limitation rather than a silent gap.
 */
class BpmnDiffViewer(
    project: Project?,
    private val request: ContentDiffRequest,
) : FrameDiffTool.DiffViewer {
    // CoreProcess is a PROJECT-level service, so it must be resolved from the
    // project container (`project.service`), not the application one — the
    // app-level `service<CoreProcess>()` accessor would send IntelliJ looking for
    // an app service whose `(Project)` constructor matches no light-service
    // signature, throwing InstantiationException. A null project (rare for a real
    // diff) is treated as "unavailable" and falls back to the message below.
    private val coreProcess: CoreProcess? =
        if (JBCefApp.isSupported()) project?.service<CoreProcess>() else null

    // Matches the core's diff session key across open/dispose. Process-unique is
    // enough — it never leaves this host.
    private val diffId = "diff-${UUID.randomUUID()}"

    private val ownDisposable = Disposer.newDisposable("BpmnDiffViewer")
    private val rootComponent: JComponent

    // Origin only drives the legend's compare-files chrome (filename + swap
    // button), so a heuristic suffices: two distinct working files ⇒ a
    // user-initiated Compare Files; a shared (or missing) file ⇒ a VCS diff.
    private val origin: String

    // The two physical browsers, fixed in place: [0] is the left / before-role
    // pane, [1] the right / after-role pane. Swap exchanges the *files* assigned
    // to these roles, not the browsers themselves.
    private val panes = mutableListOf<Pane>()

    // The file (URL + text) currently assigned to each role. Mutable so [swap]
    // can exchange them; volatile because the JS→JVM handler reads them off the
    // JCEF IO thread.
    @Volatile private var beforeBaseUrl: String? = null

    @Volatile private var afterBaseUrl: String? = null

    @Volatile private var beforeText: String = ""

    @Volatile private var afterText: String = ""

    // Captured in the constructor (when the component tree is built) and acted on
    // in init(), the EDT lifecycle point where heavy work belongs.
    private var startSession: (() -> Unit)? = null

    init {
        if (coreProcess == null) {
            origin = "scm"
            rootComponent =
                JLabel(
                    "<html><center>JCEF (embedded Chromium) is not available in this IDE.<br>" +
                        "Use an IntelliJ 2024.2+ build that bundles JCEF.</center></html>",
                    SwingConstants.CENTER,
                )
        } else {
            val before = request.contents[0]
            val after = request.contents[1]
            beforeBaseUrl = baseUrlOf(before)
            afterBaseUrl = baseUrlOf(after)
            beforeText = textOf(before)
            afterText = textOf(after)
            origin =
                if (beforeBaseUrl != null && beforeBaseUrl != afterBaseUrl) "compare-files" else "scm"

            val beforePane = createPane(ROLE_BEFORE)
            val afterPane = createPane(ROLE_AFTER)
            panes += beforePane
            panes += afterPane

            val splitter = JBSplitter(false, 0.5f)
            splitter.firstComponent = beforePane.component
            splitter.secondComponent = afterPane.component
            rootComponent = splitter

            startSession = { openAndLoad() }
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

    /** Registers the diff with the current role assignment, then loads both pages. */
    private fun openAndLoad() {
        // Register the session before the pages load: each webview emits
        // GetBpmnFileCommand as soon as its scripts run, and the core must
        // already know the pane to answer with viewer-mode XML.
        coreProcess?.openDiff(
            diffId,
            origin,
            uriFor(ROLE_BEFORE),
            beforeText,
            panes[0].post,
            uriFor(ROLE_AFTER),
            afterText,
            panes[1].post,
        )
        panes.forEach { it.load() }
    }

    /**
     * Reverses the two sides of a compare-files diff (the webview's "Swap sides"
     * button). The before-role pane (left browser) keeps its position but now
     * shows the other file, and the differ re-runs with reversed before/after.
     *
     * Implemented as dispose → re-assign → re-open → reload, the IntelliJ
     * analogue of VS Code recreating the `vscode.diff` tab. Ignored for SCM
     * diffs (the button isn't shown there, but guard defensively since message
     * routing can't encode origin).
     */
    private fun swap() {
        if (origin != "compare-files") {
            return
        }
        coreProcess?.disposeDiff(diffId)

        val swappedBeforeUrl = afterBaseUrl
        afterBaseUrl = beforeBaseUrl
        beforeBaseUrl = swappedBeforeUrl
        val swappedBeforeText = afterText
        afterText = beforeText
        beforeText = swappedBeforeText

        openAndLoad()
    }

    /** One JCEF pane plus the host-side message pipes, mirroring [BpmnFileEditor]. */
    private class Pane(
        val component: JComponent,
        val post: (String) -> Unit,
        val load: () -> Unit,
    )

    /**
     * Builds a JCEF browser for one diff role and wires both message pipes:
     * JS → JVM via [JBCefJSQuery] (routed to the core under the role's *current*
     * pane URI, recomputed live so it tracks [swap]), and JVM → JS via
     * `window.postMessage`. Loading is deferred to [Pane.load] so the core
     * session exists before the page's first buffered message flushes.
     */
    private fun createPane(role: String): Pane {
        val browser = JBCefBrowser()
        Disposer.register(ownDisposable, browser)

        val post: (String) -> Unit = { json ->
            // JSON is a valid JS object-literal expression; embed it directly.
            browser.cefBrowser.executeJavaScript("window.postMessage($json, '*');", browser.cefBrowser.url, 0)
        }

        val jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        Disposer.register(browser, jsQuery)
        jsQuery.addHandler { message ->
            onPaneMessage(role, message)
            null
        }

        // Follow the IDE color theme for this pane; the diff.css `body.vscode-dark`
        // legend styling then activates in dark IDEs. Parented to the viewer's own
        // disposable so the callback is removed when the diff tab closes.
        val themeSignal = service<IdeThemeSignal>()
        themeSignal.follow(ownDisposable, browser.cefBrowser)

        // Install the JVM sink only after the page parses, so the shim's buffered
        // messages flush into a handler that exists. Re-runs on every (re)load,
        // including the reload swap triggers.
        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    b.executeJavaScript(
                        "window.__modelerSetSink(function (p) { ${jsQuery.inject("p")} });",
                        b.url,
                        0,
                    )
                    // Re-apply on every (re)load, including swap reloads, so a
                    // theme change racing the load is not lost.
                    b.executeJavaScript(themeSignal.applyJs(), b.url, 0)
                }
            },
            browser.cefBrowser,
        )

        return Pane(browser.component, post) { browser.loadURL(service<WebviewServer>().ensureStarted()) }
    }

    /**
     * Handles one raw webview message from a pane. Swap is intercepted here (a
     * host/lifecycle command) and acted on locally; everything else forwards to
     * the core under the role's live pane URI.
     */
    private fun onPaneMessage(role: String, rawMessage: String) {
        if (isSwapCommand(rawMessage)) {
            swap()
            return
        }
        coreProcess?.forwardDiffMessage(uriFor(role), rawMessage)
    }

    /** True when the message is the webview's `SwapCompareSidesCommand`. */
    private fun isSwapCommand(rawMessage: String): Boolean =
        runCatching {
            JsonParser.parseString(rawMessage).asJsonObject.get("type")?.asString == "SwapCompareSidesCommand"
        }.getOrDefault(false)

    /**
     * Stable per-side identity, scoped by [diffId] so two diffs of the same file
     * never collide and the two sides stay distinct even when both contents
     * resolve to the same working-tree file (the usual VCS case).
     */
    private fun uriFor(role: String): String {
        val base = (if (role == ROLE_BEFORE) beforeBaseUrl else afterBaseUrl) ?: "diff:///pane"
        return "$base#$diffId-$role"
    }

    private fun baseUrlOf(content: DiffContent): String? =
        when (content) {
            is DocumentContent -> content.highlightFile?.url
            is FileContent -> content.file.url
            else -> null
        }

    /**
     * Reads a side's text under a read action (Document/VFS access requires it).
     * Handles both an open editor's [DocumentContent] and an on-disk
     * [FileContent] (Compare Files on files with no open editor); other content
     * kinds yield empty text, but [BpmnDiffTool.canShow] already declines those.
     */
    private fun textOf(content: DiffContent): String =
        ApplicationManager.getApplication().runReadAction(
            Computable {
                when (content) {
                    is DocumentContent -> content.document.text
                    is FileContent -> String(content.file.contentsToByteArray(), StandardCharsets.UTF_8)
                    else -> ""
                }
            },
        )

    private companion object {
        const val ROLE_BEFORE = "before"
        const val ROLE_AFTER = "after"
    }
}
