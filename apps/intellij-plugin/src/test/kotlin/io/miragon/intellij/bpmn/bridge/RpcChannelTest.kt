package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Exercises the transport's concurrency-critical guarantees against a scripted
 * [FakeProcess] — coalescing, back-pressure, pump survival, and the reply
 * leak-guard — without touching the supervisor. The channel needs no seams: its
 * `attach(stdin, stdout)` already takes raw streams.
 */
@ExtendWith(TestLoggerSetup::class)
class RpcChannelTest {
    private val gson = Gson()

    // Tracked so teardown stops their daemon threads: the platform JUnit5 fixtures
    // bundle a ThreadLeakTracker that auto-registers for every test in the module.
    private val openChannels = mutableListOf<RpcChannel>()
    private val openFakes = mutableListOf<FakeProcess>()

    @AfterEach
    fun closeTransports() {
        openChannels.forEach { it.close() }
        openFakes.forEach { it.close() }
    }

    private fun rpcChannel(dispatch: (method: String, params: JsonObject, id: Int?) -> Unit): RpcChannel =
        RpcChannel(dispatch).also { openChannels += it }

    private fun fakeProcess(): FakeProcess = FakeProcess().also { openFakes += it }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    /**
     * Coalescing collapses to the *latest* keyed frame while non-coalesced frames
     * survive in order. Enqueuing before [RpcChannel.attach] is deliberate: the
     * writer thread only starts on attach, so the whole flood coalesces in the
     * deque first, making the outcome deterministic.
     */
    @Test
    fun `coalescing keeps only the latest keyed frame and preserves the rest in order`() {
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }

        channel.notify("sync", mapOf("v" to 1), coalesceKey = "sync:x")
        channel.notify("sync", mapOf("v" to 2), coalesceKey = "sync:x")
        channel.notify("other", mapOf("v" to 99))
        channel.notify("sync", mapOf("v" to 3), coalesceKey = "sync:x")

        channel.attach(fake.outputStream, fake.inputStream)

        val first = parse(fake.nextFrame())
        val second = parse(fake.nextFrame())
        assertEquals("other", first.get("method").asString)
        assertEquals(99, first.getAsJsonObject("params").get("v").asInt)
        assertEquals("sync", second.get("method").asString)
        assertEquals(3, second.getAsJsonObject("params").get("v").asInt, "only the latest sync:x frame survives")
        fake.expectNoFrame()
    }

    /**
     * `notifyRaw` enqueues a pre-serialised frame verbatim yet still coalesces by
     * key exactly like `notify` — the property `EditorSessionRouter` relies on to
     * collapse spliced document-sync frames without re-serialising them. Enqueuing
     * before attach makes the flood coalesce in the deque deterministically.
     */
    @Test
    fun `notifyRaw enqueues verbatim and coalesces by key like notify`() {
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }

        channel.notifyRaw("""{"method":"webview/message","params":{"v":1}}""", coalesceKey = "sync:x")
        channel.notifyRaw("""{"method":"webview/message","params":{"v":2}}""", coalesceKey = "sync:x")
        channel.notifyRaw("""{"method":"other"}""", coalesceKey = null)
        channel.notifyRaw("""{"method":"webview/message","params":{"v":3}}""", coalesceKey = "sync:x")

        channel.attach(fake.outputStream, fake.inputStream)

        val first = parse(fake.nextFrame())
        val second = parse(fake.nextFrame())
        assertEquals("other", first.get("method").asString, "the non-coalesced frame survives in order")
        assertEquals("webview/message", second.get("method").asString)
        assertEquals(3, second.getAsJsonObject("params").get("v").asInt, "only the latest sync:x frame survives")
        fake.expectNoFrame()
    }

    /**
     * Past [OUTBOUND_CAPACITY] the oldest frame is dropped and the newest kept.
     * The writer stays detached while we overflow, so the drop happens purely in
     * the deque; attaching afterwards drains exactly the survivors.
     */
    @Test
    fun `backpressure drops the oldest frame and retains the newest`() {
        val capacity = 512
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }

        for (i in 0..capacity) channel.notify("m", i) // capacity + 1 frames

        channel.attach(fake.outputStream, fake.inputStream)

        val params = (1..capacity).map { parse(fake.nextFrame()).get("params").asInt }
        assertEquals(capacity, params.size)
        assertEquals(1, params.first(), "frame 0 was dropped as the oldest")
        assertEquals(capacity, params.last(), "the newest frame was retained")
        fake.expectNoFrame()
    }

    /** A malformed inbound line is discarded without killing the reader pump — a later valid frame still dispatches. */
    @Test
    fun `malformed inbound frame does not kill the pump`() {
        val dispatched = LinkedBlockingQueue<String>()
        val channel = rpcChannel { method, _, _ -> dispatched.add(method) }
        val fake = fakeProcess()
        channel.attach(fake.outputStream, fake.inputStream)

        fake.emit("this is not json {{{")
        fake.emit("""{"method":"ping","params":{}}""")

        assertEquals("ping", dispatched.poll(2, TimeUnit.SECONDS), "pump survived the malformed line")
    }

    /**
     * Every inbound *request* (a frame with an `id`) is answered: a throwing
     * handler still produces an `{id, error}` reply so the core's awaiting promise
     * never leaks, and a normal handler's `{id, result}` reply is written too.
     */
    @Test
    fun `inbound request is always answered even when the handler throws`() {
        var channelRef: RpcChannel? = null
        val channel = rpcChannel { method, _, id ->
            when (method) {
                "boom" -> throw RuntimeException("handler blew up")
                "echo" -> channelRef!!.reply(id!!, "ok")
            }
        }
        channelRef = channel
        val fake = fakeProcess()
        channel.attach(fake.outputStream, fake.inputStream)

        fake.emit("""{"method":"boom","params":{},"id":7}""")
        fake.emit("""{"method":"echo","params":{},"id":9}""")

        val errorReply = parse(fake.nextFrame())
        assertEquals(7, errorReply.get("id").asInt)
        assertTrue(errorReply.has("error"), "a throwing handler must still settle the request")

        val okReply = parse(fake.nextFrame())
        assertEquals(9, okReply.get("id").asInt)
        assertEquals("ok", okReply.get("result").asString)
    }

    /**
     * A `secretStore` frame whose handler throws (e.g. a failing PasswordSafe
     * call) must never have its plaintext credential reach the log. The redaction
     * runs before `log.warn`, so we assert the property on [redactFrameForLog]
     * directly rather than scraping the process-global no-op logger.
     */
    @Test
    fun `redaction strips credentials from a failing secretStore frame`() {
        val frame = """{"method":"secretStore/saveBasicAuth","params":{"username":"admin","password":"hunter2"},"id":3}"""

        val redacted = redactFrameForLog(frame, method = "secretStore/saveBasicAuth")

        assertEquals(REDACTED_FRAME, redacted)
        assertFalse(redacted.contains("hunter2"), "the plaintext password must not survive redaction")
    }

    /**
     * Credentials also ride `deployment` frames: the form relays them and the
     * core echoes stored ones back to prefill the form. A failing prefill dispatch
     * must not leak the echoed password.
     */
    @Test
    fun `redaction strips credentials from a failing deployment frame`() {
        val frame = """{"method":"deployment/postMessage","params":{"message":{"auth":{"password":"hunter2"}}}}"""

        val redacted = redactFrameForLog(frame, method = "deployment/postMessage")

        assertEquals(REDACTED_FRAME, redacted)
        assertFalse(redacted.contains("hunter2"), "the echoed password must not survive redaction")
    }

    /** An unparseable line that still mentions a credential namespace is redacted via the substring fallback. */
    @Test
    fun `redaction covers a malformed credential line with no parsed method`() {
        val corrupt = """{"method":"secretStore/saveOAuth2","params":{"clientSecret":"s3cr3t"},"""

        val redacted = redactFrameForLog(corrupt, method = null)

        assertEquals(REDACTED_FRAME, redacted)
        assertFalse(redacted.contains("s3cr3t"), "a corrupted secret frame must not leak either")
    }

    /** Non-credential frames pass through unredacted so ordinary failures stay debuggable. */
    @Test
    fun `redaction leaves non-credential frames intact`() {
        val frame = """{"method":"document/save","params":{"editorId":"x"},"id":1}"""

        assertEquals(frame, redactFrameForLog(frame, method = "document/save"))
        assertEquals(frame, redactFrameForLog(frame, method = null))
    }

    /**
     * [RpcChannel.detach] drops frames queued during the gap but leaves the writer
     * thread alive, so frames enqueued after re-attach still flow. The
     * `expectNoFrame` between detach and re-attach guarantees the dropped frame is
     * consumed-and-discarded *before* the new writer is installed, removing the
     * race where it could otherwise land on the second stream.
     */
    @Test
    fun `detach drops frames but the writer survives and resumes`() {
        val first = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }
        channel.attach(first.outputStream, first.inputStream)

        channel.notify("before", 1)
        assertEquals("before", parse(first.nextFrame()).get("method").asString)

        channel.detach()
        channel.notify("dropped", 2)
        first.expectNoFrame() // the writer wakes, sees no target, and drops the frame

        val second = fakeProcess()
        channel.attach(second.outputStream, second.inputStream)
        channel.notify("after", 3)

        val resumed = parse(second.nextFrame())
        assertEquals("after", resumed.get("method").asString, "the surviving writer resumed on the new stream")
    }
}
