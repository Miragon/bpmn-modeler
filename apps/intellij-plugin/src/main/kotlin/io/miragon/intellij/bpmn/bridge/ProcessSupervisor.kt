package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.diagnostic.Logger
import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Owns the bridge subprocess lifecycle: lazy spawn, crash detection with
 * backoff respawn, the JVM shutdown hook, and teardown.
 *
 * **Locking.** [stateLock] guards [process] assignment and is held across the
 * paired [RpcChannel.attach]/[RpcChannel.detach] calls, preserving the
 * cross-cutting invariant the former single lock provided: [handleExit]'s
 * "`process !== dead` → return, else detach" check-and-act stays atomic w.r.t. a
 * concurrent [spawn] attaching the new writer. Lock order is always
 * `stateLock → channel.ioLock`.
 *
 * `@Synchronized ensureStarted()` and the backoff respawn's `synchronized(this)`
 * share this instance's monitor (as they shared the `CoreProcess` instance's
 * before); no external code synchronises on the supervisor.
 *
 * @param launcher Creates the bridge subprocess. Injectable so tests drive a
 *   scripted fake process; production resolves and starts the bundled binary.
 * @param notifier Surfaces a fatal spawn/give-up error to the user. The
 *   production adapter defers `HostNotifications` construction so the happy path
 *   never builds the UI surface; tests pass a recording fake.
 * @param onSpawned Runs after every (re)spawn — seeds the deployment mirror.
 * @param onRespawned Runs after a *crash* respawn — re-registers live sessions.
 * @param scheduler Runs the async pre-warm spawn and the backoff respawn.
 *   Injectable so tests step time deterministically instead of waiting on the
 *   shared platform pool.
 * @param clock Wall-clock source for the stable-run window. Injectable so tests
 *   cross [STABLE_RUN_MS] without sleeping.
 */
internal class ProcessSupervisor(
    private val channel: RpcChannel,
    private val launcher: BridgeProcessLauncher,
    private val notifier: BridgeErrorNotifier,
    private val onSpawned: () -> Unit,
    private val onRespawned: () -> Unit,
    private val scheduler: ScheduledExecutorService = AppExecutorUtil.getAppScheduledExecutorService(),
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val log = Logger.getInstance(ProcessSupervisor::class.java)

    private val stateLock = Any()

    // Read unsynchronized from the routers/dispose and the shutdown hook, so its
    // writes must publish safely across threads.
    @Volatile
    private var process: Process? = null

    private val disposed = AtomicBoolean(false)
    private val restartAttempts = AtomicInteger(0)

    @Volatile
    private var lastSpawnAt = 0L

    private var shutdownHook: Thread? = null

    val isAlive: Boolean get() = process?.isAlive == true

    // ── lifecycle ────────────────────────────────────────────────────────────

    @Synchronized
    fun ensureStarted() {
        if (process?.isAlive == true) return
        spawn()
    }

    /**
     * Brings the bridge up **off the EDT** when it isn't already running.
     *
     * `spawn()` does blocking process I/O — `ProcessBuilder.start()` can stall for
     * seconds on Windows while Defender scans the freshly materialised binary — so
     * it must never run on the caller's thread when that caller is the EDT (editor,
     * diff, or tool-window construction). Callers enqueue their first frame
     * synchronously instead; the writer thread drains it once the process is up, so
     * nothing is lost by deferring the spawn.
     */
    fun ensureStartedAsync() {
        if (process?.isAlive == true) return
        scheduler.execute {
            if (disposed.get()) return@execute
            ensureStarted()
        }
    }

    /**
     * Pre-warms the bridge at project open so the first `.bpmn` tab, diff, or
     * deployment panel renders against an already-running process instead of
     * waiting on a cold spawn. Safe to call repeatedly — no-ops once alive.
     */
    fun prewarm() = ensureStartedAsync()

    private fun spawn() {
        try {
            val started = launcher.launch()
            synchronized(stateLock) {
                process = started
                channel.attach(started.outputStream, started.inputStream)
            }
            lastSpawnAt = clock()
            // stderr is the core's diagnostic channel (stdout is reserved for RPC).
            channel.pump(started.errorStream, "modeler-bridge-stderr") { log.info("[bridge stderr] $it") }
            started.onExit().thenAccept { handleExit(started) }
            ensureShutdownHook()
            // Seed the deployment-state mirror up front so the bridge's synchronous
            // getters are correct; re-runs on every (re)spawn, rebuilding the mirror.
            onSpawned()
            log.info("Miragon modeler bridge started")
        } catch (e: Exception) {
            log.error("Failed to start the modeler bridge", e)
            notifier.showError("Could not start the BPMN modeler engine. See idea.log.")
        }
    }

    /**
     * Reacts to the bridge process dying. Distinguishes a stable run that
     * crashed (reset the attempt counter) from a rapid restart loop (give up
     * after [MAX_RESTARTS]); on a survivable crash, respawns with linear backoff
     * and recovers every open editor.
     */
    private fun handleExit(dead: Process) {
        if (disposed.get()) return
        synchronized(stateLock) {
            if (process !== dead) return // already replaced by a newer spawn
            channel.detach()
        }

        if (clock() - lastSpawnAt > STABLE_RUN_MS) {
            restartAttempts.set(0)
        }
        val attempt = restartAttempts.incrementAndGet()
        if (attempt > MAX_RESTARTS) {
            log.error("Modeler bridge exited $attempt times in quick succession; giving up.")
            notifier.showError(
                "The BPMN modeler engine crashed repeatedly and will not be restarted. " +
                    "Reopen the file or restart the IDE. See idea.log.",
            )
            return
        }
        log.warn(
            "Modeler bridge exited (code ${runCatching { dead.exitValue() }.getOrNull()}); " +
                "restart attempt $attempt/$MAX_RESTARTS",
        )

        // Respawn off this thread, not via Thread.sleep: handleExit runs on the
        // Process.onExit() CompletableFuture callback (ForkJoinPool.commonPool),
        // and blocking it for the backoff would hold a shared platform pool
        // thread for up to seconds. Re-check disposed/liveness at fire time.
        scheduler.schedule(
            {
                if (disposed.get()) return@schedule
                synchronized(this) { if (process?.isAlive != true) spawn() }
                onRespawned()
            },
            RESTART_BACKOFF_MS * attempt,
            TimeUnit.MILLISECONDS,
        )
    }

    private fun ensureShutdownHook() {
        if (shutdownHook != null) return
        // On JVM exit the service's own dispose() may not run, so this hook is the
        // only teardown. Mark `disposed` first so the process-exit handler treats
        // the kill as intentional shutdown (not a crash to restart from), then
        // close stdin so the bridge exits cleanly on EOF; destroyForcibly is the
        // bounded fallback for a bridge that ignores the EOF.
        val hook =
            Thread {
                disposed.set(true)
                channel.closeFromShutdownHook()
                val dying = process
                if (dying != null && !dying.waitFor(500, TimeUnit.MILLISECONDS)) {
                    runCatching { dying.destroyForcibly() }
                }
            }
        shutdownHook = hook
        runCatching { Runtime.getRuntime().addShutdownHook(hook) }
    }

    fun dispose() {
        disposed.set(true)
        channel.close()
        shutdownHook?.let { runCatching { Runtime.getRuntime().removeShutdownHook(it) } }
        shutdownHook = null

        val dying = process
        process = null
        if (dying != null) {
            // Closing stdin makes the bridge exit on EOF; give it a moment, then force.
            dying.destroy()
            if (!dying.waitFor(2, TimeUnit.SECONDS)) dying.destroyForcibly()
        }
    }

    private companion object {
        const val MAX_RESTARTS = 5
        const val RESTART_BACKOFF_MS = 500L
        const val STABLE_RUN_MS = 15_000L
    }
}
