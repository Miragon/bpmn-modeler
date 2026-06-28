package io.miragon.intellij.bpmn

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp

/**
 * Keeps one [WarmBrowser] ready per project so the first `.bpmn` tab renders
 * against an already-loaded bpmn-js page instead of paying the cold browser
 * spawn + bundle fetch + bpmn-js init on the open path.
 *
 * **Pool of one.** A single warm browser covers the common case (the user opens
 * one file first); [take] hands it over and asynchronously refills, so a burst of
 * opens still benefits after the first. Pre-warming costs one idle JCEF browser
 * per project window — disposed on project close if never used.
 *
 * **Threading.** A `JBCefBrowser` is an AWT heavyweight whose native window is
 * created here via `createImmediately()`, so construction is marshalled to the EDT.
 * The heavy work (the loopback bundle fetch and bpmn-js init) then runs
 * asynchronously inside the CEF render process, off the EDT.
 *
 * **Dispose ownership.** A *taken* browser belongs to its [BpmnFileEditor], which
 * registers it as a child disposable and tears it down when the tab closes. The
 * still-held warm browser is owned here and disposed with the project — it is
 * deliberately not registered to this service as a parent, so handing it off never
 * risks a double dispose.
 */
@Service(Service.Level.PROJECT)
class BrowserPrewarmService(private val project: Project) : Disposable {
    private val lock = Any()

    // The single ready browser, or null while one is being built or after it was
    // taken. Accessed from the EDT (build/take) under [lock] for visibility.
    private var warm: WarmBrowser? = null

    /** Builds the first warm browser at project open. No-op without JCEF. */
    fun warmUp() {
        if (!JBCefApp.isSupported()) return
        ensureWarm()
    }

    /**
     * Returns a ready [WarmBrowser], building a cold one inline if none is staged
     * (same cost as the pre-pre-warm behaviour), then refills the pool. Must run on
     * the EDT — `JBCefBrowser` creation requires it; `BpmnFileEditor` construction
     * already satisfies this.
     */
    fun take(): WarmBrowser {
        val taken =
            synchronized(lock) {
                val ready = warm
                warm = null
                ready
            } ?: WarmBrowser()
        ensureWarm()
        return taken
    }

    private fun ensureWarm() {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            synchronized(lock) {
                if (warm == null) warm = WarmBrowser()
            }
        }
    }

    override fun dispose() {
        val unused = synchronized(lock) { warm.also { warm = null } }
        unused?.let { Disposer.dispose(it) }
    }
}
