package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.progress.ProcessCanceledException
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
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

    @Test
    fun `notify writes XML content without HTML escapes`() {
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }
        val xml = "<bpmn:task id='t' name=\"A & B\"/>".repeat(1_000)

        channel.notify("document/didChange", mapOf("content" to xml))
        channel.attach(fake.outputStream, fake.inputStream)

        val frame = fake.nextFrame()
        assertFalse(frame.contains("\\u003c") || frame.contains("\\u0026") || frame.contains("\\u0027"))
        assertTrue(frame.contains("<bpmn:task id='t'"), "markup is written verbatim")
        assertEquals(xml, parse(frame).getAsJsonObject("params").get("content").asString)
        val quoteEscapes = 2 * 1_000
        assertTrue(frame.length < xml.length + quoteEscapes + 100, "frame size stays close to the raw XML length")
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

    @Test
    fun `backpressure preserves a reliable authoritative document update`() {
        val capacity = 512
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }

        channel.notify(
            "document/didChange",
            mapOf("content" to "authoritative"),
            coalesceKey = "document:e1",
            reliable = true,
        )
        for (i in 0 until capacity) channel.notify("m", i)

        channel.attach(fake.outputStream, fake.inputStream)

        val frames = (0 until capacity).map { parse(fake.nextFrame()) }
        assertTrue(frames.any { it.get("method").asString == "document/didChange" })
        assertEquals(capacity - 1, frames.count { it.get("method").asString == "m" })
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
                "echo" -> channelRef!!.reply(id!!, ClipboardReadResult("ok"))
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
        assertEquals("ok", okReply.getAsJsonObject("result").get("text").asString)
    }

    private fun attachedChannel(): Pair<RpcChannel, FakeProcess> {
        val fake = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }
        channel.attach(fake.outputStream, fake.inputStream)
        return channel to fake
    }

    private val runInline: (Runnable) -> Unit = { it.run() }

    /** Gson refuses to write NaN, so replying with this result fails. */
    private class UnserialisableResult(val ratio: Double) : RpcResult

    @Test
    fun `a request answered from the EDT gets an error reply when the EDT work throws`() {
        val (channel, fake) = attachedChannel()

        channel.replyFromEdt(id = 5, method = "document/write", runOnEdt = runInline) {
            throw IllegalStateException("refused")
        }

        val reply = parse(fake.nextFrame())
        assertEquals(5, reply.get("id").asInt)
        assertEquals("refused", reply.get("error").asString)
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered from the EDT gets an error reply when the EDT work fails with an Error`() {
        val (channel, fake) = attachedChannel()

        assertThrows(AssertionError::class.java) {
            channel.replyFromEdt(id = 9, method = "document/write", runOnEdt = runInline) {
                throw AssertionError("broken")
            }
        }

        val reply = parse(fake.nextFrame())
        assertEquals(9, reply.get("id").asInt)
        assertEquals("broken", reply.get("error").asString)
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered from the EDT rethrows a cancellation after answering it with an error`() {
        val (channel, fake) = attachedChannel()

        assertThrows(ProcessCanceledException::class.java) {
            channel.replyFromEdt(id = 10, method = "document/write", runOnEdt = runInline) {
                throw ProcessCanceledException()
            }
        }

        val reply = parse(fake.nextFrame())
        assertEquals(10, reply.get("id").asInt)
        assertTrue(reply.has("error"))
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered from the EDT gets an error reply when its result cannot be serialised`() {
        val (channel, fake) = attachedChannel()

        channel.replyFromEdt(id = 11, method = "document/write", runOnEdt = runInline) {
            UnserialisableResult(Double.NaN)
        }

        val reply = parse(fake.nextFrame())
        assertEquals(11, reply.get("id").asInt)
        assertTrue(reply.has("error"))
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered from the EDT gets exactly one reply carrying the work's result`() {
        val (channel, fake) = attachedChannel()
        val edtQueue = mutableListOf<Runnable>()

        channel.replyFromEdt(id = 6, method = "document/save", runOnEdt = { edtQueue += it }) {
            DocumentSaveResult(saved = true)
        }
        assertEquals(1, edtQueue.size, "the work is handed to the EDT")
        fake.expectNoFrame()
        edtQueue.single().run()

        val reply = parse(fake.nextFrame())
        assertEquals(6, reply.get("id").asInt)
        assertTrue(reply.getAsJsonObject("result").get("saved").asBoolean)
        fake.expectNoFrame()
    }

    @Test
    fun `a notification handled on the EDT runs its work without replying`() {
        val (channel, fake) = attachedChannel()
        var workRan = false

        channel.replyFromEdt(id = null, method = "document/write", runOnEdt = runInline) {
            workRan = true
            DocumentWriteResult(changed = true, accepted = true)
        }

        assertTrue(workRan)
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered later from the EDT gets an error reply when the work throws before answering`() {
        val (channel, fake) = attachedChannel()

        channel.replyLaterFromEdt(id = 7, method = "picker/show", runOnEdt = runInline) {
            throw IllegalStateException("popup failed")
        }

        val reply = parse(fake.nextFrame())
        assertEquals(7, reply.get("id").asInt)
        assertEquals("popup failed", reply.get("error").asString)
        fake.expectNoFrame()
    }

    @Test
    fun `a request answered later from the EDT keeps its first answer`() {
        val (channel, fake) = attachedChannel()
        var pendingReply: PendingReply? = null

        channel.replyLaterFromEdt(id = 8, method = "picker/show", runOnEdt = runInline) { reply ->
            pendingReply = reply
            reply.result(PickerShowResult(listOf(1)))
            throw IllegalStateException("after answering")
        }
        pendingReply?.result(PickerShowResult(listOf(2)))
        pendingReply?.error("late")

        val reply = parse(fake.nextFrame())
        assertEquals(8, reply.get("id").asInt)
        assertEquals(listOf(1), reply.getAsJsonObject("result").getAsJsonArray("selected").map { it.asInt })
        fake.expectNoFrame()
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

    @Test
    fun `detach retains a reliable frame until the replacement writer attaches`() {
        val first = fakeProcess()
        val channel = rpcChannel { _, _, _ -> }
        channel.attach(first.outputStream, first.inputStream)
        channel.detach()

        channel.notify(
            "document/didChange",
            mapOf("content" to "authoritative"),
            coalesceKey = "document:e1",
            reliable = true,
        )
        first.expectNoFrame()

        val second = fakeProcess()
        channel.attach(second.outputStream, second.inputStream)

        val retained = parse(second.nextFrame())
        assertEquals("document/didChange", retained.get("method").asString)
        assertEquals("authoritative", retained.getAsJsonObject("params").get("content").asString)
    }

    /** A core request as the host received it, answered through the channel that dispatched it. */
    private class ReceivedRequest(val method: String, val answer: (RpcResult) -> Unit)

    private fun answerableChannel(): Pair<RpcChannel, LinkedBlockingQueue<ReceivedRequest>> {
        val received = LinkedBlockingQueue<ReceivedRequest>()
        var channelRef: RpcChannel? = null
        val channel =
            rpcChannel { method, _, id ->
                received.add(ReceivedRequest(method) { result -> channelRef!!.reply(id!!, result) })
            }
        channelRef = channel
        return channel to received
    }

    @Test
    fun `does not send a reply for a dead bridge to the next one`() {
        val (channel, received) = answerableChannel()
        val dead = fakeProcess()
        channel.attach(dead.outputStream, dead.inputStream)
        dead.emit("""{"method":"picker/show","params":{},"id":1}""")
        val pickerOfDeadBridge = received.poll(2, TimeUnit.SECONDS)!!

        dead.kill()
        channel.detach()
        val respawned = fakeProcess()
        channel.attach(respawned.outputStream, respawned.inputStream)
        respawned.emit("""{"method":"clipboard/read","params":{},"id":1}""")
        val clipboardOfRespawnedBridge = received.poll(2, TimeUnit.SECONDS)!!

        pickerOfDeadBridge.answer(PickerShowResult(listOf(0)))
        clipboardOfRespawnedBridge.answer(ClipboardReadResult("fresh"))

        assertEquals(listOf("""{"id":1,"result":{"text":"fresh"}}"""), respawned.framesUntilQuiet())
    }

    @Test
    fun `drops a reply for a dead bridge instead of keeping it for the next one`() {
        val (channel, received) = answerableChannel()
        val dead = fakeProcess()
        channel.attach(dead.outputStream, dead.inputStream)
        dead.emit("""{"method":"document/write","params":{},"id":3}""")
        val writeOfDeadBridge = received.poll(2, TimeUnit.SECONDS)!!

        dead.kill()
        channel.detach()
        writeOfDeadBridge.answer(DocumentWriteResult(changed = true, accepted = true))
        dead.expectNoFrame()

        val respawned = fakeProcess()
        channel.attach(respawned.outputStream, respawned.inputStream)

        respawned.expectNoFrame(500)
    }
}
