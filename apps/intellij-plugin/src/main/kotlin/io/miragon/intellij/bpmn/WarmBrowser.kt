package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.ui.jcef.JcefShortcutProvider
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter

/**
 * A JCEF browser pre-loaded with a modeler webview ([shellUrl] selects the BPMN
 * or DMN shell), ready to be handed to a [BpmnFileEditor] / [DmnFileEditor] the
 * moment a modeler tab opens.
 *
 * **Why it exists.** The first modeler open otherwise pays, serially, for
 * `JBCefBrowser()` init + the loopback fetch of the heavy modeler bundle + its
 * init — the most perceptible startup latency. Building this ahead of time (at
 * project open, via [BrowserPrewarmService]) moves all of that off the open path.
 * The BPMN path pre-warms one of these per project; the DMN path builds one
 * inline on open (a `.dmn` tab is opened rarely enough not to justify a second
 * always-warm browser).
 *
 * **The forwarder indirection.** The JS→JVM [JBCefJSQuery] must be created *before*
 * the browser's CEF process starts: its handler registers a `CefMessageRouter` on
 * the client via `CefClient.addMessageRouter`, and CEF only binds routers added
 * before render-process creation (verified against the 2024.2 SDK — creating the
 * query after `createImmediately()` would need a pre-sized `JS_QUERY_POOL_SIZE`).
 * But the `editorId` — hence the real core forward target — is unknown at pre-warm
 * time. So the handler delegates to a swappable [forwarder] that [bind] sets once
 * the editor exists.
 *
 * **Buffered first message.** The page is loaded during pre-warm, so bpmn-js posts
 * its initial `GetBpmnFileCommand` before any sink exists; the shim's `outbox`
 * buffers it. [bind] injects the sink, which flushes that buffered message to the
 * now-set forwarder. The sink is deliberately *not* injected during pre-warm, so
 * nothing flushes to a null forwarder.
 */
class WarmBrowser(private val shellUrl: String) : Disposable {
    val browser = createModelerBrowser()

    // Set by bind() once the owning editor is known; read from the CEF query
    // handler thread, so volatile for safe publication.
    @Volatile
    var forwarder: ((String) -> Unit)? = null
        private set

    private val jsQuery: JBCefJSQuery

    // Guards the loaded/pendingSink handoff between onLoadEnd (CEF thread) and
    // bind() (EDT): without it, bind() could observe loaded=false and set the
    // pending flag *after* onLoadEnd already checked it, dropping the sink inject.
    private val lock = Any()
    private var loaded = false
    private var pendingSinkInject = false

    init {
        Disposer.register(this, browser)

        // macOS only: JBCefBrowser registers IDE actions ($SelectAll/$Undo/$Redo/
        // $Copy/$Paste/$Cut) on this component that hijack ⌘-shortcuts and route
        // them to native CEF frame commands acting only on focused text fields.
        // bpmn-js is a canvas app, so ⌘A/⌘Z silently no-op there. Unregistering the
        // forwarders lets ⌘-keystrokes fall through to the webview like Ctrl does,
        // restoring select-all/undo/redo/copy/paste. No-op off macOS.
        runCatching {
            JcefShortcutProvider.getActions().forEach {
                it.second.unregisterCustomShortcutSet(browser.component)
            }
        }

        forwardUndoRedoToWebview()

        // Created before createImmediately() so its message router binds to the
        // render process; the handler delegates to the swappable forwarder.
        jsQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        Disposer.register(browser, jsQuery)
        jsQuery.addHandler { request ->
            // Hop off the CEF UI thread (it also delivers OSR onPaint) so JSON work
            // in the forwarder never competes with frame delivery. The handler's own
            // return value is unused (null), so returning before the work completes
            // is correct.
            webviewForwardExecutor.execute { forwarder?.invoke(request) }
            null
        }

        browser.jbCefClient.addLoadHandler(
            object : CefLoadHandlerAdapter() {
                override fun onLoadEnd(b: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                    val injectNow =
                        synchronized(lock) {
                            loaded = true
                            pendingSinkInject
                        }
                    if (injectNow) injectSink(b)
                    // Re-apply on (re)load so a theme change racing the pre-warm load
                    // is not lost; indexHtml() already bakes in the initial theme.
                    b.executeJavaScript(service<IdeThemeSignal>().applyJs(), b.url, 0)
                }
            },
            browser.cefBrowser,
        )

        // Force native creation now so the deferred loadURL fires off-screen during
        // pre-warm instead of waiting for the component to be shown in a tab. Order
        // matters: jsQuery.create() above ran before this, so its router is bound.
        browser.createImmediately()
        browser.loadURL(shellUrl)
    }

    /**
     * Binds this warm browser to its editor: wires the JS→JVM [forward] target and
     * injects the sink so the shim flushes its buffered first message. The caller
     * must register the core session *before* calling this, so the flush order is
     * register → `GetBpmnFileCommand`. Safe to call whether or not the page has
     * finished loading: if not loaded, the sink inject defers to the next load end.
     */
    fun bind(forward: (String) -> Unit) {
        forwarder = forward
        val injectNow =
            synchronized(lock) {
                if (!loaded) pendingSinkInject = true
                loaded
            }
        if (injectNow) injectSink(browser.cefBrowser)
    }

    /**
     * Makes Ctrl+Z / Ctrl+Y reach bpmn-js. IntelliJ's global `$Undo`/`$Redo`
     * actions consume the keystroke before it reaches this OSR browser, and a
     * global keymap action can't be suppressed per-component — but a
     * component-scoped action with the same shortcut wins over it while focus is
     * here. Each forwards to the page's `__modelerTriggerEditorAction` hook,
     * which runs the matching bpmn-js editor action (see the bpmn-webview's
     * `hostEditorActions.ts`). The existing macOS `JcefShortcutProvider`
     * unregister above never addressed the global action, so undo was broken on
     * every platform.
     */
    private fun forwardUndoRedoToWebview() {
        registerWebviewShortcut("\$Undo", "undo")
        registerWebviewShortcut("\$Redo", "redo")
    }

    private fun registerWebviewShortcut(actionId: String, editorAction: String) {
        val cef = browser.cefBrowser
        val js = "window.__modelerTriggerEditorAction && window.__modelerTriggerEditorAction('$editorAction');"
        val action = DumbAwareAction.create { cef.executeJavaScript(js, cef.url, 0) }
        val shortcuts = KeymapUtil.getActiveKeymapShortcuts(actionId)
        action.registerCustomShortcutSet(shortcuts, browser.component, this)
    }

    // inject("p") emits the JS that ships the string argument `p` back to the
    // jsQuery handler; __modelerSetSink installs it and flushes the shim outbox.
    private fun injectSink(b: CefBrowser) {
        b.executeJavaScript(
            "window.__modelerSetSink(function (p) { ${jsQuery.inject("p")} });",
            b.url,
            0,
        )
    }

    override fun dispose() {
        // browser (and the jsQuery registered under it) are torn down via Disposer.
    }
}
