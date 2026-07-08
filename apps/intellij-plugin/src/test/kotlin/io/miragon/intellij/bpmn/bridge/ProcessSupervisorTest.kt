package io.miragon.intellij.bpmn.bridge

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

/**
 * Drives [ProcessSupervisor] through its crash/restart logic with a scripted
 * [FakeProcess], a [DeterministicScheduler], and a [MutableClock] so backoff,
 * the give-up threshold, the stable-run reset, dispose safety, and the
 * re-register contract are asserted instantly and without real processes or
 * sleeps. The injection seams make the production wiring identical while letting
 * tests control time, scheduling, process birth/death, and error reporting.
 *
 * Session re-registration is covered only at the *contract* level (the supervisor
 * invokes [onRespawned] exactly when it should); the router content it triggers
 * is IntelliJ-coupled and out of scope here.
 */
@ExtendWith(TestLoggerSetup::class)
class ProcessSupervisorTest {
    /** Records the user-facing errors the supervisor surfaces, so tests can assert what (and how often) it reported. */
    private class RecordingErrorNotifier : BridgeErrorNotifier {
        val errors = mutableListOf<String>()

        override fun showError(message: String) {
            errors += message
        }
    }

    /** A notifier that fails the test if invoked — used on happy paths that must surface no error. */
    private val failOnError = BridgeErrorNotifier { fail("unexpected error notification: $it") }

    // Every fake the launcher hands the supervisor, closed in teardown so no
    // stdin/stdout pump survives the test — the JUnit5 platform fixtures bundle a
    // ThreadLeakTracker that auto-registers for every test in the module. The
    // supervisor only ever kills the *current* process, so respawned fakes would
    // otherwise leak their pumps.
    private val spawnedFakes = mutableListOf<FakeProcess>()

    /** A fake registered for teardown — used as the supervisor's launcher result. */
    private fun spawnFake(): FakeProcess = FakeProcess().also { spawnedFakes += it }

    @AfterEach
    fun closeSpawnedFakes() {
        spawnedFakes.forEach { it.close() }
    }

    /**
     * Each crash within the stable window respawns at `500ms × attempt`; once the
     * attempts exceed `MAX_RESTARTS` the supervisor gives up — no further spawn —
     * and surfaces exactly one user-facing error.
     */
    @Test
    fun `crashes within the stable window respawn with linear backoff then give up`() {
        val processes = mutableListOf<FakeProcess>()
        val scheduler = DeterministicScheduler()
        val notifier = RecordingErrorNotifier()
        val supervisor =
            ProcessSupervisor(
                channel = RpcChannel { _, _, _ -> },
                launcher = { spawnFake().also { processes += it } },
                notifier = notifier,
                onSpawned = {},
                onRespawned = {},
                scheduler = scheduler,
                clock = MutableClock(),
            )

        supervisor.ensureStarted()
        assertEquals(1, processes.size)

        repeat(5) {
            processes.last().kill()
            scheduler.runPending()
        }

        assertEquals(6, processes.size, "5 respawns followed the initial spawn")
        assertEquals(listOf(500L, 1000L, 1500L, 2000L, 2500L), scheduler.recordedDelays)
        assertEquals(emptyList<String>(), notifier.errors, "no error before the give-up threshold")

        processes.last().kill()
        scheduler.runPending()
        assertEquals(6, processes.size, "no respawn past the give-up threshold")
        assertEquals(1, notifier.errors.size, "give-up surfaced exactly one user-facing error")
        assertTrue(notifier.errors.single().contains("crashed repeatedly"), "the error explains the give-up")

        supervisor.dispose()
    }

    /** A crash after the process ran past the stable window resets the attempt counter, so backoff restarts at attempt 1. */
    @Test
    fun `a stable run resets the restart counter`() {
        val processes = mutableListOf<FakeProcess>()
        val scheduler = DeterministicScheduler()
        val clock = MutableClock()
        val supervisor =
            ProcessSupervisor(
                channel = RpcChannel { _, _, _ -> },
                launcher = { spawnFake().also { processes += it } },
                notifier = failOnError,
                onSpawned = {},
                onRespawned = {},
                scheduler = scheduler,
                clock = clock,
            )

        supervisor.ensureStarted()
        processes.last().kill()
        scheduler.runPending()
        processes.last().kill()
        scheduler.runPending()
        assertEquals(listOf(500L, 1000L), scheduler.recordedDelays)

        // The process ran stably (well past the 15s window) before this crash.
        clock.set(STABLE_WINDOW_EXCEEDED_MS)
        processes.last().kill()
        scheduler.runPending()

        assertEquals(listOf(500L, 1000L, 500L), scheduler.recordedDelays, "the stable run reset the counter to attempt 1")
        assertEquals(4, processes.size, "the post-stable crash still respawned")

        supervisor.dispose()
    }

    /** A respawn scheduled before [ProcessSupervisor.dispose] must no-op when it fires — the disposed re-check guards it. */
    @Test
    fun `dispose prevents a scheduled respawn from firing`() {
        val processes = mutableListOf<FakeProcess>()
        val scheduler = DeterministicScheduler()
        var respawnCount = 0
        val supervisor =
            ProcessSupervisor(
                channel = RpcChannel { _, _, _ -> },
                launcher = { spawnFake().also { processes += it } },
                notifier = failOnError,
                onSpawned = {},
                onRespawned = { respawnCount++ },
                scheduler = scheduler,
                clock = MutableClock(),
            )

        supervisor.ensureStarted()
        processes.last().kill() // schedules a respawn
        supervisor.dispose()
        scheduler.runPending() // the scheduled task must observe `disposed` and bail

        assertEquals(1, processes.size, "no respawn after dispose")
        assertEquals(0, respawnCount, "onRespawned never ran")
    }

    /**
     * The re-register contract: [onSpawned] runs on the first spawn *and* every
     * crash respawn; [onRespawned] runs only after a crash respawn — never on the
     * first spawn and never on dispose.
     */
    @Test
    fun `onSpawned runs on every spawn while onRespawned runs only after a crash`() {
        val processes = mutableListOf<FakeProcess>()
        val scheduler = DeterministicScheduler()
        var spawnCount = 0
        var respawnCount = 0
        val supervisor =
            ProcessSupervisor(
                channel = RpcChannel { _, _, _ -> },
                launcher = { spawnFake().also { processes += it } },
                notifier = failOnError,
                onSpawned = { spawnCount++ },
                onRespawned = { respawnCount++ },
                scheduler = scheduler,
                clock = MutableClock(),
            )

        supervisor.ensureStarted()
        assertEquals(1, spawnCount)
        assertEquals(0, respawnCount, "onRespawned must not run on the first spawn")

        processes.last().kill()
        scheduler.runPending()
        assertEquals(2, spawnCount, "onSpawned ran again on the crash respawn")
        assertEquals(1, respawnCount, "onRespawned ran after the crash")

        supervisor.dispose()
        assertEquals(1, respawnCount, "dispose does not trigger a re-register")
    }

    /**
     * A crash fires [ProcessSupervisor.onProcessDown] once per confirmed death so
     * the host can clear in-flight spinners — even before the respawn runs, and
     * even on the give-up crash where no respawn follows.
     */
    @Test
    fun `a crash fires onProcessDown before the respawn`() {
        val processes = mutableListOf<FakeProcess>()
        val scheduler = DeterministicScheduler()
        var downCount = 0
        val supervisor =
            ProcessSupervisor(
                channel = RpcChannel { _, _, _ -> },
                launcher = { spawnFake().also { processes += it } },
                notifier = RecordingErrorNotifier(),
                onSpawned = {},
                onRespawned = {},
                onProcessDown = { downCount++ },
                scheduler = scheduler,
                clock = MutableClock(),
            )

        supervisor.ensureStarted()
        assertEquals(0, downCount, "no death yet")

        // Each crash within the stable window fires onProcessDown once, including
        // the final give-up crash that schedules no respawn.
        repeat(6) {
            processes.last().kill()
            scheduler.runPending()
        }
        assertEquals(6, downCount, "onProcessDown fired once per crash")

        supervisor.dispose()
    }

    private companion object {
        // Comfortably past the supervisor's private 15s STABLE_RUN_MS.
        const val STABLE_WINDOW_EXCEEDED_MS = 20_000L
    }
}
