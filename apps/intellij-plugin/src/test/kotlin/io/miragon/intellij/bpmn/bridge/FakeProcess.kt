package io.miragon.intellij.bpmn.bridge

import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * A scripted [Process] standing in for the real Bun bridge so the supervisor and
 * transport can be driven deterministically: tests [emit] core→host frames, read
 * back the host→core frames the writer produced, and [kill] the process on demand
 * to assert crash/restart behavior — with no real binary, sockets, or sleeps.
 *
 * Stream directions follow the *core's* point of view, matching [Process]:
 *  - [getOutputStream] is the core's stdin — the host writes frames here; tests
 *    read them back via [nextFrame].
 *  - [getInputStream] is the core's stdout — tests push frames via [emit]; the
 *    host's reader pump consumes them.
 *
 * Pipe buffers are oversized so a flood of outbound frames never blocks the
 * writer waiting on a reader (the back-pressure/coalescing tests enqueue many).
 *
 * [AutoCloseable] so a test can shut the fake's daemon pumps down in teardown —
 * the JUnit5 platform fixtures bundle a `ThreadLeakTracker` that auto-registers for
 * every test in the module and fails any that leaves a thread running.
 */
internal class FakeProcess : Process(), AutoCloseable {
    private val pipeBuffer = 1 shl 20

    // Core stdin: host → core. The writer thread writes here; tests read it back.
    private val stdinSink = PipedOutputStream()
    private val stdinView = PipedInputStream(stdinSink, pipeBuffer)
    private val stdinReader = BufferedReader(InputStreamReader(stdinView, StandardCharsets.UTF_8))

    // One daemon pump per fake drains every host→core line into this queue, so
    // tests read frames with a plain blocking poll. This deliberately avoids both
    // a per-read thread (the back-pressure test would spawn 512) and any shared
    // executor: an `expectNoFrame` poll that times out by design must not leave a
    // blocked `readLine()` task on `ForkJoinPool.commonPool()`, whose parallelism
    // is 1 on a 2-core CI runner — one such leak starves the pool and a later
    // test's `nextFrame` times out even though its frame is already in the pipe.
    private val inboundFrames = LinkedBlockingQueue<String>()

    // Core stdout: core → host. Tests write here; the host's reader pump consumes.
    private val stdoutSource = PipedOutputStream()
    private val stdoutView = PipedInputStream(stdoutSource, pipeBuffer)
    private val stdoutWriter = BufferedWriter(OutputStreamWriter(stdoutSource, StandardCharsets.UTF_8))

    // The real bridge keeps stderr separate; nothing under test reads it.
    private val stderr = ByteArrayInputStream(ByteArray(0))

    private val exit = CompletableFuture<Process>()

    @Volatile
    private var alive = true

    @Volatile
    private var exitCode = 0

    init {
        Thread({
            // forEachLine ends on EOF/close; runCatching swallows the interrupt
            // when the test JVM tears the fake down.
            runCatching { stdinReader.forEachLine(inboundFrames::add) }
        }, "fake-bridge-stdin-pump").apply {
            isDaemon = true
            start()
        }
    }

    override fun getOutputStream(): OutputStream = stdinSink

    override fun getInputStream(): InputStream = stdoutView

    override fun getErrorStream(): InputStream = stderr

    override fun waitFor(): Int {
        exit.join()
        return exitCode
    }

    override fun exitValue(): Int = if (alive) throw IllegalThreadStateException() else exitCode

    override fun isAlive(): Boolean = alive

    override fun destroy() = kill(SIGTERM)

    override fun onExit(): CompletableFuture<Process> = exit

    // ── test API ──────────────────────────────────────────────────────────────

    /** Pushes one newline-delimited frame onto the core's stdout. */
    fun emit(frame: String) {
        stdoutWriter.write(frame)
        stdoutWriter.write("\n")
        stdoutWriter.flush()
    }

    /**
     * Returns the next frame the host wrote to stdin, failing fast on timeout so a
     * never-arriving frame surfaces as an error instead of hanging the suite.
     */
    fun nextFrame(timeoutMillis: Long = 2_000): String =
        inboundFrames.poll(timeoutMillis, TimeUnit.MILLISECONDS)
            ?: error("no frame on bridge stdin within ${timeoutMillis}ms")

    /** Asserts no frame is written within [timeoutMillis] (e.g. after detach). */
    fun expectNoFrame(timeoutMillis: Long = 250) {
        val line = inboundFrames.poll(timeoutMillis, TimeUnit.MILLISECONDS)
        if (line != null) error("expected no frame, but got: $line")
    }

    /**
     * Simulates the process dying. Closing the stdout source EOFs the host's
     * reader pump (as a real exit would), and completing [exit] fires the
     * supervisor's `onExit` callback synchronously on the caller's thread — the
     * property that makes restart assertions deterministic.
     */
    fun kill(code: Int = 1) {
        if (!alive) return
        alive = false
        exitCode = code
        runCatching { stdoutWriter.close() }
        exit.complete(this)
    }

    /**
     * Full teardown for tests: [kill] EOFs the host's reader pump (via the stdout
     * close), and closing the stdin sink EOFs this fake's own stdin pump — so both
     * daemon threads exit and the leak tracker stays quiet. Idempotent: safe on an
     * already-killed fake.
     */
    override fun close() {
        kill()
        runCatching { stdinSink.close() }
    }

    private companion object {
        const val SIGTERM = 143
    }
}
