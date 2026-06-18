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
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

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
 */
internal class FakeProcess : Process() {
    private val pipeBuffer = 1 shl 20

    // Core stdin: host → core. The writer thread writes here; tests read it back.
    private val stdinSink = PipedOutputStream()
    private val stdinView = PipedInputStream(stdinSink, pipeBuffer)
    private val stdinReader = BufferedReader(InputStreamReader(stdinView, StandardCharsets.UTF_8))

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
     * never-arriving frame surfaces as an error instead of hanging the suite. The
     * read runs on a pooled daemon thread, so a timeout leaks no test thread.
     */
    fun nextFrame(timeoutMillis: Long = 2_000): String {
        val read = CompletableFuture.supplyAsync { stdinReader.readLine() }
        val line = read.get(timeoutMillis, TimeUnit.MILLISECONDS)
        return line ?: error("bridge stdin reached EOF; no frame")
    }

    /** Asserts no frame is written within [timeoutMillis] (e.g. after detach). */
    fun expectNoFrame(timeoutMillis: Long = 250) {
        val read = CompletableFuture.supplyAsync { stdinReader.readLine() }
        try {
            val line = read.get(timeoutMillis, TimeUnit.MILLISECONDS)
            error("expected no frame, but got: $line")
        } catch (_: TimeoutException) {
            // Expected: nothing was written.
        }
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

    private companion object {
        const val SIGTERM = 143
    }
}
