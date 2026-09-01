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
 * coalescing, while authoritative document updates and RPC replies remain queued
 * until a live writer accepts them.
 *
 * **Locking.** [ioLock] guards the [writer] reference and every write/flush — the
 * writer half of the split lock. The supervisor's `stateLock`
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

    private data class OutFrame(val line: String, val coalesceKey: String?, val reliable: Boolean)

    private val outbound = ArrayDeque<OutFrame>()
    private val outboundMonitor = Object()
    private var writerThread: Thread? = null

    private val ioLock = Any()
    private var writer: BufferedWriter? = null

    // Stops the writer loop. Set by close()/closeFromShutdownHook(); the supervisor
    // keeps its own `disposed` flag for the process-lifecycle half.
    private val closed = AtomicBoolean(false)

    // ── outbound ──────────────────────────────────────────────────────────────

    fun notify(method: String, params: Any?, coalesceKey: String? = null, reliable: Boolean = false) =
        enqueue(
            gson.toJson(linkedMapOf("method" to method, "params" to params)),
            coalesceKey,
            reliable,
        )

    /**
     * Enqueues an already-serialised NDJSON frame verbatim, coalescing by
     * [coalesceKey] like [notify]. Lets a caller that has the raw webview JSON in
     * hand splice it into the frame instead of parsing and re-serialising it — the
     * JSON work then never touches the CEF query thread. [line] must be a single
     * line of valid JSON; the framing appends the trailing newline.
     */
    fun notifyRaw(line: String, coalesceKey: String? = null) = enqueue(line, coalesceKey, false)

    fun reply(id: Int, result: Any?) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "result" to result)), null, true)

    // The bridge's `rpc.ts` turns `{id, error}` into a rejected promise, so a
    // handler that throws still settles the core's awaiting request instead of
    // leaking it.
    fun replyError(id: Int, message: String) =
        enqueue(gson.toJson(linkedMapOf("id" to id, "error" to message)), null, true)

    private fun enqueue(line: String, coalesceKey: String?, reliable: Boolean) {
        synchronized(outboundMonitor) {
            if (coalesceKey != null) {
                val iterator = outbound.iterator()
                while (iterator.hasNext()) {
                    if (iterator.next().coalesceKey == coalesceKey) iterator.remove()
                }
            }
            if (outbound.size >= OUTBOUND_CAPACITY) {
                val iterator = outbound.iterator()
                var removed = false
                while (iterator.hasNext()) {
                    if (!iterator.next().reliable) {
                        iterator.remove()
                        removed = true
                        break
                    }
                }
                if (!removed && !reliable) {
                    log.warn("Outbound bridge queue full ($OUTBOUND_CAPACITY); dropped newest best-effort frame")
                    return
                }
                if (removed) {
                    log.warn("Outbound bridge queue full ($OUTBOUND_CAPACITY); dropped oldest best-effort frame")
                }
            }
            outbound.addLast(OutFrame(line, coalesceKey, reliable))
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
                retryOrDrop(frame, "No bridge writer")
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
                synchronized(ioLock) {
                    if (writer === target) writer = null
                }
                retryOrDrop(frame, "Bridge write failed")
            }
        }
    }

    private fun retryOrDrop(frame: OutFrame, reason: String) {
        if (!frame.reliable) {
            log.debug("$reason; dropped a best-effort frame")
            return
        }
        synchronized(outboundMonitor) {
            if (closed.get()) return
            val superseded =
                frame.coalesceKey != null && outbound.any { it.coalesceKey == frame.coalesceKey }
            if (!superseded) outbound.addFirst(frame)
            if (!superseded) outboundMonitor.wait(RELIABLE_RETRY_MS)
        }
    }

    // ── inbound ───────────────────────────────────────────────────────────────

    /** Dispatches one line received from the core's stdout. */
    private fun onLine(line: String) {
        val message =
            try {
                gson.fromJson(line, JsonObject::class.java)
            } catch (e: Exception) {
                // `method` is unreadable here (the line failed to parse), so
                // redactFrameForLog falls back to a substring probe.
                log.warn("Discarding malformed core message: ${redactFrameForLog(line, method = null)}", e)
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
            log.warn("Failed to handle core message ($method): ${redactFrameForLog(line, method)}", e)
            id?.let { replyError(it, e.message ?: "host handler failed") }
        }
    }

    // ── attach / detach / shutdown ────────────────────────────────────────────

    /** Wraps the new process's stdin and starts the writer thread (once) + stdout pump. */
    fun attach(stdin: OutputStream, stdout: InputStream) {
        synchronized(ioLock) {
            writer = BufferedWriter(OutputStreamWriter(stdin, StandardCharsets.UTF_8))
        }
        synchronized(outboundMonitor) { outboundMonitor.notifyAll() }
        pump(stdout, "modeler-bridge-reader") { onLine(it) }
        ensureWriterThread()
    }

    /** Drops the writer during a restart window; reliable queued frames wait for re-attach. */
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
        const val RELIABLE_RETRY_MS = 100L
    }
}

// JSON-RPC namespaces whose frames can carry plaintext credentials: the password
// / clientSecret live in `secretStore/*` params, the deployment form relays the
// same secrets (and the core echoes stored ones back to prefill the form) under
// `deployment/*`, and the marketplace personal access tokens ride `tokenStore/*`
// params and the `tokenPrompt/*` reply. Their bodies must never reach idea.log.
// Kept in sync with `SecretStoreRouter`, `DeploymentRouter`, and `MarketplaceRouter`.
internal val CREDENTIAL_METHOD_PREFIXES =
    listOf("secretStore/", "deployment/", "tokenStore/", "tokenPrompt/")
internal const val REDACTED_FRAME = "<redacted: credential-bearing frame>"

/**
 * Strips the body of a credential-bearing frame before it is logged. When the
 * [method] is known (a parsed frame that then threw during dispatch) we match the
 * credential namespaces exactly; for an unparseable line ([method] == null) we
 * fall back to a substring probe so a corrupted secret frame still can't leak its
 * plaintext. Other frames pass through unredacted for debuggability.
 */
internal fun redactFrameForLog(line: String, method: String?): String {
    val sensitive =
        if (method != null) {
            CREDENTIAL_METHOD_PREFIXES.any { method.startsWith(it) }
        } else {
            CREDENTIAL_METHOD_PREFIXES.any { line.contains(it) }
        }
    return if (sensitive) REDACTED_FRAME else line
}
