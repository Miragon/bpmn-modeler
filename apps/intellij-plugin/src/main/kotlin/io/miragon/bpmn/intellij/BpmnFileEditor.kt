package io.miragon.bpmn.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.util.EnvironmentUtil
import java.awt.BorderLayout
import java.beans.PropertyChangeListener
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.nio.file.Files
import java.nio.file.Paths
import java.util.concurrent.TimeUnit
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * Per-file editor: spawns one `bpmn-modeler` CLI subprocess on a random
 * port, embeds a `JBCefBrowser` pointed at it, and tears both down on
 * disposal. Shows a friendly panel instead of a browser if JCEF is
 * unavailable or Node.js is missing.
 */
class BpmnFileEditor(
    @Suppress("UNUSED_PARAMETER") project: Project,
    private val file: VirtualFile,
) : UserDataHolderBase(), FileEditor {

    private val rootPanel = JPanel(BorderLayout())
    private var browser: JBCefBrowser? = null
    private var process: Process? = null

    init {
        setUp()
    }

    private fun setUp() {
        if (!JBCefApp.isSupported()) {
            showMessage(
                "JCEF is not available in this IDE runtime. " +
                    "Please use a JetBrains Runtime that includes JCEF.",
            )
            return
        }
        val nodeExe = resolveNodeExecutable()
        if (nodeExe == null) {
            showMessage(buildNodeMissingMessage())
            return
        }
        LOG.info("Using node executable: $nodeExe")
        startModeler(nodeExe)
    }

    private fun startModeler(nodeExe: String) {
        try {
            val port = pickFreePort()
            val cliEntry = CliBundle.resolve()

            process = newProcess(
                nodeExe,
                cliEntry.toString(),
                "--port", port.toString(),
                "--no-open",
                file.path,
            ).start()

            val browserInstance = JBCefBrowser()
            browser = browserInstance
            rootPanel.add(browserInstance.component, BorderLayout.CENTER)

            pollAndNavigate(browserInstance, port)
        } catch (e: Exception) {
            LOG.warn("Failed to start BPMN modeler for ${file.path}", e)
            showMessage("Failed to start BPMN modeler: ${e.message}")
        }
    }

    private fun pickFreePort(): Int {
        return ServerSocket(0).use { it.localPort }
    }

    /**
     * Finds a working `node` binary.
     *
     * Order:
     * 1. Bare `node` via the environment we pass to ProcessBuilder (works
     *    if IntelliJ's `EnvironmentUtil` captured the shell PATH correctly).
     * 2. Common absolute install locations — covers the macOS case where
     *    IDEs launched from Finder or Dock don't inherit the shell PATH.
     *    Volta, Homebrew (Apple Silicon and Intel), fnm, nvm, system.
     *
     * Returns the path to a binary that successfully printed a version
     * string, or `null` if nothing worked.
     */
    private fun resolveNodeExecutable(): String? {
        if (tryNodeBinary("node")) {
            return "node"
        }
        for (candidate in nodeCandidatePaths()) {
            if (Files.isExecutable(Paths.get(candidate)) && tryNodeBinary(candidate)) {
                return candidate
            }
        }
        return null
    }

    private fun tryNodeBinary(path: String): Boolean {
        return try {
            val proc = newProcess(path, "--version").start()
            val ok = proc.waitFor(3, TimeUnit.SECONDS) && proc.exitValue() == 0
            if (!ok) {
                LOG.info("Node candidate '$path' exited with ${proc.exitValue()}")
            }
            ok
        } catch (e: Exception) {
            LOG.info("Node candidate '$path' not executable: ${e.message}")
            false
        }
    }

    /**
     * Common absolute install locations for `node` on macOS / Linux.
     * Ordered by popularity so the first hit on most machines is fast.
     */
    private fun nodeCandidatePaths(): List<String> {
        val home = System.getProperty("user.home") ?: return emptyList()
        val result = mutableListOf(
            "$home/.volta/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "$home/.fnm/aliases/default/bin/node",
            "/usr/bin/node",
        )
        // nvm installs node under ~/.nvm/versions/node/<version>/bin/node —
        // there can be many; pick the lexicographically latest (good enough
        // for version resolution without pulling in semver parsing).
        val nvmRoot = Paths.get(home, ".nvm", "versions", "node")
        if (Files.isDirectory(nvmRoot)) {
            try {
                Files.list(nvmRoot).use { stream ->
                    val latest = stream.filter { Files.isDirectory(it) }
                        .sorted(Comparator.reverseOrder())
                        .findFirst()
                        .orElse(null)
                    if (latest != null) {
                        result.add(1, latest.resolve("bin/node").toString())
                    }
                }
            } catch (_: Exception) {
                // Ignore — nvm scan is best-effort.
            }
        }
        return result
    }

    private fun buildNodeMissingMessage(): String {
        val shellPath = EnvironmentUtil.getEnvironmentMap()["PATH"] ?: "(unset)"
        val triedCandidates = nodeCandidatePaths().joinToString(", ")
        return """
            <html>
            <b>Node.js 20+ is required but was not found.</b><br><br>
            The plugin tried <code>node</code> on the shell PATH and the
            common install locations (Volta, Homebrew, fnm, nvm, system).<br><br>
            Install Node.js from <a href="https://nodejs.org">https://nodejs.org</a>
            or via your package manager.<br><br>
            <b>PATH seen by plugin:</b><br><code>$shellPath</code><br><br>
            <b>Candidate locations checked:</b><br><code>$triedCandidates</code>
            </html>
        """.trimIndent()
    }

    /**
     * Build a `ProcessBuilder` with the user's shell environment applied.
     *
     * Critical on macOS: IDEs launched from Finder / Dock inherit the
     * system launchd PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), not the
     * user's shell PATH. That means a `node` installed via Homebrew, nvm,
     * Volta, or fnm is invisible to a bare `ProcessBuilder("node", ...)`.
     * IntelliJ's [EnvironmentUtil] captures the real shell environment
     * (by running a login shell once at startup); this method applies
     * that environment to the child process.
     */
    private fun newProcess(vararg command: String): ProcessBuilder {
        val pb = ProcessBuilder(*command).redirectErrorStream(true)
        val shellEnv = EnvironmentUtil.getEnvironmentMap()
        val processEnv = pb.environment()
        processEnv["PATH"] = shellEnv["PATH"] ?: processEnv["PATH"] ?: ""
        // Home-derived vars that Node tooling may need.
        shellEnv["HOME"]?.let { processEnv["HOME"] = it }
        shellEnv["NVM_DIR"]?.let { processEnv["NVM_DIR"] = it }
        shellEnv["VOLTA_HOME"]?.let { processEnv["VOLTA_HOME"] = it }
        return pb
    }

    /**
     * Background-poll `http://localhost:<port>/` until it responds, then
     * navigate JCEF to it. Prevents a "connection refused" flash in the
     * browser during the ~200 ms window before Express binds.
     */
    private fun pollAndNavigate(browser: JBCefBrowser, port: Int) {
        val url = "http://localhost:$port"
        val deadline = System.currentTimeMillis() + READY_TIMEOUT_MS
        ApplicationManager.getApplication().executeOnPooledThread {
            while (System.currentTimeMillis() < deadline) {
                if (tryConnect(url)) {
                    SwingUtilities.invokeLater { browser.loadURL(url) }
                    return@executeOnPooledThread
                }
                try {
                    Thread.sleep(POLL_INTERVAL_MS)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return@executeOnPooledThread
                }
            }
            // Final attempt even if the poll timed out — let JCEF surface
            // the real error to the user.
            SwingUtilities.invokeLater { browser.loadURL(url) }
        }
    }

    private fun tryConnect(url: String): Boolean = try {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "HEAD"
        conn.connectTimeout = 500
        conn.readTimeout = 500
        val status = conn.responseCode
        conn.disconnect()
        status in 200..399
    } catch (_: Exception) {
        false
    }

    private fun showMessage(text: String) {
        rootPanel.removeAll()
        rootPanel.add(JBLabel(text), BorderLayout.CENTER)
        rootPanel.revalidate()
        rootPanel.repaint()
    }

    override fun getComponent(): JComponent = rootPanel
    override fun getPreferredFocusedComponent(): JComponent? = browser?.component
    override fun getName(): String = "BPMN Modeler"
    override fun getFile(): VirtualFile = file
    override fun setState(state: FileEditorState) = Unit
    override fun isModified(): Boolean = false
    override fun isValid(): Boolean = true
    override fun addPropertyChangeListener(listener: PropertyChangeListener) = Unit
    override fun removePropertyChangeListener(listener: PropertyChangeListener) = Unit
    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun dispose() {
        process?.let { p ->
            p.destroy()
            ApplicationManager.getApplication().executeOnPooledThread {
                if (!p.waitFor(2, TimeUnit.SECONDS)) {
                    p.destroyForcibly()
                }
            }
        }
        browser?.let { Disposer.dispose(it) }
    }

    companion object {
        private val LOG = logger<BpmnFileEditor>()
        private const val READY_TIMEOUT_MS = 5_000L
        private const val POLL_INTERVAL_MS = 100L
    }
}
