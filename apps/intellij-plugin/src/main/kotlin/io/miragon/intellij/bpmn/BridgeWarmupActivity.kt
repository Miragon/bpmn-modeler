package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.ui.jcef.JBCefApp

/**
 * Pre-warms the modeler bridge (and its asset HTTP server) shortly after a
 * project opens, so the first `.bpmn` tab — diff, or deployment panel — renders
 * against an already-running process instead of paying a cold spawn when the user
 * opens it.
 *
 * The cold spawn is the freeze culprit behind the slow-plugin banner: launching
 * the bundled binary can stall for seconds on Windows (Defender scanning a
 * freshly materialised executable). [CoreProcess.registerSession] now spawns off
 * the EDT regardless, so the freeze is gone either way; warming here merely gets
 * the process up before any editor needs it.
 *
 * Runs on a background coroutine (never the EDT), so the blocking spawn is safe to
 * trigger from here. Gated on JCEF support: with no JCEF the editor shows a
 * fallback and never talks to the bridge, so there is nothing to warm.
 */
class BridgeWarmupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        if (!JBCefApp.isSupported()) return
        // Pay the loopback HTTP bind off the EDT once per IDE; later editor opens
        // then hit the already-bound URL instantly.
        service<WebviewServer>().ensureStarted()
        project.service<CoreProcess>().prewarm()
    }
}
