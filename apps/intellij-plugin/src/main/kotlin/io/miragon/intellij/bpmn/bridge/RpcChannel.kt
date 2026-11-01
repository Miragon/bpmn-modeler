package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.ControlFlowException
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
 * coalescing, while authoritative document updates remain queued until a live
 * writer accepts them. An RPC reply goes only to the process that sent its
 * request and is dropped once that process is detached.
 *
 * **Locking.** [ioLock] guards the [attached] process and every write/flush — the
 * writer half of the split lock. The supervisor's `stateLock`
 * guards process identity and is held across the paired [attach]/[detach] calls;
 * lock order is always `stateLock → ioLock`, and [writerLoop] only ever takes
 * [ioLock], so the split cannot deadlock.
 */
internal class RpcChannel(
    private val dispatch: (method: String, params: JsonObject, requestId: CoreRequestId?) -> Unit,
) {
    private val log = Logger.getInstance(RpcChannel::class.java)

    /**
     * Shared with the routers so the whole bridge uses one Gson. HTML escaping is
     * off because frames never land inside HTML, and escaping every `<`/`>`/`=`
     * would inflate each full-XML frame.
     */
    val gson: Gson = GsonBuilder().disableHtmlEscaping().create()

    private data class OutFrame(
        val line: String,
        val coalesceKey: String?,
        val reliable: Boolean,
        val replyTo: CoreRequestId?,
    ) {
        fun isDeliverableTo(processGeneration: Int?): Boolean =
            replyTo?.wasSentBy(processGeneration) ?: true
    }

    private class AttachedProcess(val writer: BufferedWriter, val generation: Int)

    private val outbound = ArrayDeque<OutFrame>()
    private val outboundMonitor = Object()
    private var writerThread: Thread? = null

    private val ioLock = Any()
    private var attached: AttachedProcess? = null
    private var lastGeneration = 0

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

    fun reply(requestId: CoreRequestId, result: RpcResult?) =
        enqueueReply(requestId, gson.toJson(linkedMapOf("id" to requestId.value, "result" to result)))

    // The bridge's `rpc.ts` turns `{id, error}` into a rejected promise, so a
    // handler that throws still settles the core's awaiting request instead of
    // leaking it.
    fun replyError(requestId: CoreRequestId, message: String) =
        enqueueReply(requestId, gson.toJson(linkedMapOf("id" to requestId.value, "error" to message)))

    private fun enqueueReply(requestId: CoreRequestId, line: String) =
        enqueue(line, coalesceKey = null, reliable = true, replyTo = requestId)

    /**
     * Runs [work] on the EDT and answers request [requestId] exactly once: with its
     * result, or with an error when it throws. [onLine]'s catch cannot see work
     * that hops to the EDT, and an unanswered request stalls the core's
     * per-editor queue.
     */
    fun replyFromEdt(
        requestId: CoreRequestId?,
        method: String,
        runOnEdt: (Runnable) -> Unit = invokeLaterOnEdt,
        work: () -> RpcResult?,
    ) = runOnEdt(
        Runnable { answerOnce(PendingReply(this, requestId), method) { it.result(work()) } },
    )

    /**
     * [replyFromEdt] for work that answers from a later callback, such as a popup
     * selection; a throw before that answer still answers with an error.
     */
    fun replyLaterFromEdt(
        requestId: CoreRequestId,
        method: String,
        runOnEdt: (Runnable) -> Unit = invokeLaterOnEdt,
        work: (PendingReply) -> Unit,
    ) = runOnEdt(Runnable { answerOnce(PendingReply(this, requestId), method, work) })

    private fun answerOnce(reply: PendingReply, method: String, work: (PendingReply) -> Unit) {
        try {
            work(reply)
        } catch (failure: Throwable) {
            reply.error(failure.message ?: "host handler failed")
            if (failure is ControlFlowException || failure !is Exception) throw failure
            log.warn("Failed to handle core request ($method) on the EDT", failure)
        }
    }

    private fun enqueue(
        line: String,
        coalesceKey: String?,
        reliable: Boolean,
        replyTo: CoreRequestId? = null,
    ) {
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
            outbound.addLast(OutFrame(line, coalesceKey, reliable, replyTo))
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
            val target = synchronized(ioLock) { attached }
            if (!frame.isDeliverableTo(target?.generation)) {
                log.debug("Dropped a reply for a bridge process that is gone")
                continue
            }
            if (target == null) {
                retryOrDrop(frame, "No bridge writer")
                continue
            }
            try {
                synchronized(ioLock) {
                    target.writer.write(frame.line)
                    target.writer.write("\n")
                    target.writer.flush()
                }
            } catch (e: Exception) {
                log.warn("Failed to write to bridge stdin", e)
                synchronized(ioLock) {
                    if (attached === target) attached = null
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

    /** Dispatches one line received from the stdout of the process attached as [generation]. */
    private fun onLine(line: String, generation: Int) {
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
        val requestId =
            message.get("id")?.takeIf { !it.isJsonNull }?.asInt?.let { CoreRequestId(it, generation) }

        // A malformed/unexpected frame (missing member, wrong type, a throwing
        // handler such as a failing PasswordSafe call) must not escape: this runs
        // on the daemon reader thread, and an escaped exception would kill the
        // pump — core→host traffic stops forever, and once the stdout pipe fills
        // the bridge wedges without exiting, so the crash supervisor never fires.
        // If the frame was a request, also answer it: an unanswered request would
        // otherwise leak the core's awaiting promise.
        try {
            dispatch(method, params, requestId)
        } catch (e: Exception) {
            log.warn("Failed to handle core message ($method): ${redactFrameForLog(line, method)}", e)
            requestId?.let { replyError(it, e.message ?: "host handler failed") }
        }
    }

    // ── attach / detach / shutdown ────────────────────────────────────────────

    /**
     * Wraps the new process's stdin and starts the writer thread (once) + stdout pump.
     *
     * @return the generation of the attached process, which its requests carry.
     */
    fun attach(stdin: OutputStream, stdout: InputStream): Int {
        val writer = BufferedWriter(OutputStreamWriter(stdin, StandardCharsets.UTF_8))
        val process =
            synchronized(ioLock) { AttachedProcess(writer, ++lastGeneration).also { attached = it } }
        synchronized(outboundMonitor) { outboundMonitor.notifyAll() }
        pump(stdout, "modeler-bridge-reader") { onLine(it, process.generation) }
        ensureWriterThread()
        return process.generation
    }

    /**
     * Drops the writer during a restart window. Reliable notifications wait for
     * re-attach; replies to the detached process are dropped.
     */
    fun detach() {
        synchronized(ioLock) { attached = null }
    }

    /** Dispose path: stop the loop, wake the waiting writer, close stdin. */
    fun close() {
        closed.set(true)
        synchronized(outboundMonitor) { outboundMonitor.notifyAll() }
        synchronized(ioLock) {
            runCatching { attached?.writer?.close() }
            attached = null
        }
    }

    /**
     * Shutdown-hook path: stop the loop and close stdin so the bridge exits on
     * EOF, but do *not* notify the outbound monitor — the JVM is exiting and the
     * old hook never woke the writer either.
     */
    fun closeFromShutdownHook() {
        closed.set(true)
        synchronized(ioLock) { runCatching { attached?.writer?.close() } }
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

private val invokeLaterOnEdt: (Runnable) -> Unit = { ApplicationManager.getApplication().invokeLater(it) }

/**
 * The answer to one core request: the first [result] or [error] is sent and later
 * ones are dropped, so a callback that answers and a throw that follows still
 * produce one reply.
 */
internal class PendingReply(
    private val channel: RpcChannel,
    private val requestId: CoreRequestId?,
) {
    private val answered = AtomicBoolean(false)

    fun result(value: RpcResult?) = answer { channel.reply(it, value) }

    fun error(message: String) = answer { channel.replyError(it, message) }

    private fun answer(send: (CoreRequestId) -> Unit) {
        val request = requestId ?: return
        if (!answered.compareAndSet(false, true)) return
        try {
            send(request)
        } catch (failure: Throwable) {
            // Nothing was sent (e.g. an unserialisable result), so a later
            // error reply may still answer the request.
            answered.set(false)
            throw failure
        }
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
