package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.diagnostic.Logger
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bidirectional, newline-delimited JSON-RPC transport over the bridge's
 * stdin/stdout (the peer of the TS `Rpc`). It owns *only* framing and threading;
 * routing of inbound frames is the injected [dispatch] lambda's job.
 *
 * Outbound (host→core) frames are drained by a single writer thread so the EDT /
 * JCEF threads never block on the bridge's stdin. The deque also enables
 * coalescing: a flood of document syncs collapses to its latest frame.
 *
 * **Locking.** [ioLock] guards the [writer] reference and every write/flush — the
 * writer half of the former single `writeLock`. The supervisor's `stateLock`
 * guards process identity and is held across the paired [attach]/[detach] calls;
 * lock order is always `stateLock → ioLock`, and [writerLoop] only ever takes
 * [ioLock], so the split cannot deadlock.
 */
internal class RpcChannel(
    private val dispatch: (method: String, params: JsonObject, id: Int?) -> Unit,
) {
    private val log = Logger.getInstance(RpcChannel::class.java)

    /** Shared with the routers so the whole bridge uses one Gson, as before. */
    val gson = Gson()

    private data class OutFrame(val line: String, val coalesceKey: String?)

    private val outbound = ArrayDeque<OutFrame>()
    private val outboundMonitor = Object()
    private var writerThread: Thread? = null

    private val ioLock = Any()
    private var writer: BufferedWriter? = null

    // Stops the writer loop. Set by close()/closeFromShutdownHook(); the supervisor
    // keeps its own `disposed` flag for the process-lifecycle half.
    private val closed = AtomicBoolean(false)

    // ── outbound ──────────────────────────────────────────────────────────────

    fun notify(method: String, params: Any?, coalesceKey: String? = null) =
        enqueue(gson.toJson(linkedMapOf("method" to method, "params" to params)), coalesceKey)

    fun reply(id: Int, result: Any?) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "result" to result)), null)

    // The bridge's `rpc.ts` turns `{id, error}` into a rejected promise, so a
    // handler that throws still settles the core's awaiting request instead of
    // leaking it.
    fun replyError(id: Int, message: String) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "error" to message)), null)

    private fun enqueue(line: String, coalesceKey: String?) {
        synchronized(outboundMonitor) {
            if (coalesceKey != null) {
                val iterator = outbound.iterator()
                while (iterator.hasNext()) {
                    if (iterator.next().coalesceKey == coalesceKey) iterator.remove()
                }
            }
            if (outbound.size >= OUTBOUND_CAPACITY) {
                outbound.removeFirst()
                log.warn("Outbound bridge queue full ($OUTBOUND_CAPACITY); dropped oldest frame (backpressure)")
            }
            outbound.addLast(OutFrame(line, coalesceKey))
            outboundMonitor.notifyAll()
        }
    }

    private fun ensureWriterThread() {
        if (writerThread != null) return
        writerThread =
            Thread({ writerLoop() }, "modeler-bridge-writer").apply {
                isDaemon = true
                start()
            }
    }

    private fun writerLoop() {
        while (!closed.get()) {
            val frame =
                synchronized(outboundMonitor) {
                    while (outbound.isEmpty() && !closed.get()) outboundMonitor.wait()
                    if (closed.get()) return else outbound.removeFirst()
                }
            val target = synchronized(ioLock) { writer }
            if (target == null) {
                // No live bridge stdin (restart window). Drop rather than spin:
                // sessions are re-seeded from the authoritative Document on restart.
                log.debug("No bridge writer; dropped a queued frame during restart")
                continue
            }
            try {
                synchronized(ioLock) {
                    target.write(frame.line)
                    target.write("\n")
                    target.flush()
                }
            } catch (e: Exception) {
                log.warn("Failed to write to bridge stdin", e)
            }
        }
    }

    // ── inbound ───────────────────────────────────────────────────────────────

    /** Dispatches one line received from the core's stdout. */
    private fun onLine(line: String) {
        val message =
            try {
                gson.fromJson(line, JsonObject::class.java)
            } catch (e: Exception) {
                log.warn("Discarding malformed core message: $line", e)
                return
            }
        // The host issues no requests to the core, so a frame without `method`
        // (i.e. a response) is never expected and is ignored.
        val method = message.get("method")?.takeIf { !it.isJsonNull }?.asString ?: return
        val params = message.getAsJsonObject("params")
        val id = message.get("id")?.takeIf { !it.isJsonNull }?.asInt

        // A malformed/unexpected frame (missing member, wrong type, a throwing
        // handler such as a failing PasswordSafe call) must not escape: this runs
        // on the daemon reader thread, and an escaped exception would kill the
        // pump — core→host traffic stops forever, and once the stdout pipe fills
        // the bridge wedges without exiting, so the crash supervisor never fires.
        // If the frame was a request, also answer it: an unanswered request would
        // otherwise leak the core's awaiting promise.
        try {
            dispatch(method, params, id)
        } catch (e: Exception) {
            log.warn("Failed to handle core message ($method): $line", e)
            id?.let { replyError(it, e.message ?: "host handler failed") }
        }
    }

    // ── attach / detach / shutdown ────────────────────────────────────────────

    /** Wraps the new process's stdin and starts the writer thread (once) + stdout pump. */
    fun attach(stdin: OutputStream, stdout: InputStream) {
        synchronized(ioLock) {
            writer = BufferedWriter(OutputStreamWriter(stdin, StandardCharsets.UTF_8))
        }
        pump(stdout, "modeler-bridge-reader") { onLine(it) }
        ensureWriterThread()
    }

    /** Drops the writer during a restart window; queued frames are dropped, as before. */
    fun detach() {
        synchronized(ioLock) { writer = null }
    }

    /** Dispose path: stop the loop, wake the waiting writer, close stdin. */
    fun close() {
        closed.set(true)
        synchronized(outboundMonitor) { outboundMonitor.notifyAll() }
        synchronized(ioLock) {
            runCatching { writer?.close() }
            writer = null
        }
    }

    /**
     * Shutdown-hook path: stop the loop and close stdin so the bridge exits on
     * EOF, but do *not* notify the outbound monitor — the JVM is exiting and the
     * old hook never woke the writer either.
     */
    fun closeFromShutdownHook() {
        closed.set(true)
        synchronized(ioLock) { runCatching { writer?.close() } }
    }

    /** Reads [input] line by line on a daemon thread; also used for the bridge's stderr. */
    fun pump(input: InputStream, threadName: String, onLine: (String) -> Unit) {
        val reader = BufferedReader(InputStreamReader(input, StandardCharsets.UTF_8))
        Thread({
            reader.useLines { lines -> lines.forEach(onLine) }
        }, threadName).apply {
            isDaemon = true
            start()
        }
    }

    private companion object {
        const val OUTBOUND_CAPACITY = 512
    }
}
