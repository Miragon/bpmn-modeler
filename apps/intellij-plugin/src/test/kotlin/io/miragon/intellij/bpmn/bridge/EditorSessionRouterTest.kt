package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.junit5.RunInEdt
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import com.intellij.testFramework.junit5.fixture.tempPathFixture
import io.miragon.intellij.bpmn.CoreSession
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files

/**
 * Covers Part A of #1106 — explicit causation on the host's write echo — against a
 * **real** IntelliJ `Document`, the only way to verify that `Document.setText`
 * synchronously fires the editor's `DocumentListener` while [EditorSessionRouter]'s
 * per-editor causation token is set. A fake document could only assume that timing;
 * the whole point of the bug class (the bridge dropping its own write by causation
 * rather than by content comparison) lives in that synchronous re-entrancy.
 *
 * `@RunInEdt(writeIntent = true)` runs each test on the EDT with the write-intent
 * lock so write actions and `invokeLater` pumping work; the annotation only targets
 * the class, and `allMethods` defaults to true, so every `@Test` is covered.
 */
@TestApplication
@RunInEdt(writeIntent = true)
class EditorSessionRouterTest {
    private val projectFixture = projectFixture()
    private val tempDirFixture = tempPathFixture()

    private val gson = Gson()

    // Cleaned up in teardown: the bridge threads (ThreadLeakTracker) and the backing
    // file (tempPathFixture only removes the directory when it is empty).
    private var fixture: Fixture? = null

    @AfterEach
    fun tearDown() {
        fixture?.let {
            it.wired.dispose()
            Files.deleteIfExists(it.bpmn.nioPath)
        }
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    /**
     * Wires a router over a real `.bpmn` Document and an open session, draining the
     * `session/register` frame so the test starts from a quiet channel.
     */
    private fun setUpRouter(initialXml: String): Fixture {
        val project = projectFixture.get()
        val bpmn = createBpmnFile(tempDirFixture.get(), "process.bpmn", initialXml)
        val wired = wireChannel()
        val scheduler = DeterministicScheduler()
        val router = EditorSessionRouter(bridgeDeps(project, wired.channel, wired.handlers), scheduler)
        router.register()

        val session = CoreSession(bpmn.file.url, bpmn.file, project) {}
        router.registerSession(session)
        assertEquals(
            "session/register",
            parse(wired.fake.nextFrame()).get("method").asString,
            "registerSession seeds the core before any document traffic",
        )
        return Fixture(router, session, bpmn, wired, scheduler).also { fixture = it }
    }

    private class Fixture(
        val router: EditorSessionRouter,
        val session: CoreSession,
        val bpmn: BpmnTestFile,
        val wired: WiredBridge,
        val scheduler: DeterministicScheduler,
    )

    /**
     * Re-creates the host's real echo wiring from `BpmnFileEditor`: the editor's
     * `DocumentListener` mirrors every Document change back into the core. This is
     * the listener that `handleWrite`'s `setText` re-enters synchronously, so it
     * must be in place for the causation token to ever be observed.
     */
    private fun Fixture.attachEditorEcho() {
        bpmn.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    router.notifyDocumentChanged(session.editorId, event.document.text)
                }
            },
            Disposer.newDisposable(session.project, "editor-echo"),
        )
    }

    @Test
    fun `handleWrite stamps causedBy on the echoed document didChange`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        val params =
            f.wired.channel.gson
                .toJsonTree(mapOf("editorId" to f.session.editorId, "content" to EDITED_XML, "revision" to REVISION))
                .asJsonObject
        f.wired.handlers.dispatch("document/write", params, 1)
        // handleWrite defers the mutation to invokeLater; pump it so setText (and the
        // synchronous listener echo it triggers) actually runs before we read frames.
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertEquals(
            REVISION,
            didChange.getAsJsonObject("params").get("causedBy").asLong,
            "the write's echo carries the write's revision as causedBy",
        )

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt)
        assertTrue(reply.getAsJsonObject("result").get("changed").asBoolean, "the write changed the document")
    }

    @Test
    fun `an external edit omits causedBy`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        // A genuine external edit (git revert, the plain-text tab, another tool):
        // no pending causation token, so the echo must not be tagged as the host's own.
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }

        // The external path is debounced, so nothing is sent until the timer fires;
        // step it deterministically rather than waiting on the wall clock. The timer
        // marshals its send onto the EDT, so pump the queue too.
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertEquals(
            EDITED_XML,
            didChange.getAsJsonObject("params").get("content").asString,
            "the debounced send carries the latest external content",
        )
        assertFalse(
            didChange.getAsJsonObject("params").has("causedBy"),
            "an edit the host did not originate carries no causation token",
        )
    }

    @Test
    fun `a burst of external edits collapses to a single send of the latest content`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        // Three rapid external edits: each reschedules the debounce, so only the
        // final content should reach the core once the timer fires.
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(SECOND_EDIT_XML) }
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(THIRD_EDIT_XML) }

        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertEquals(
            THIRD_EDIT_XML,
            didChange.getAsJsonObject("params").get("content").asString,
            "only the latest content of a typing burst is sent",
        )
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `forwardWebviewMessage splices the raw message into the same frame shape as a parse+reserialize`() {
        val f = setUpRouter(INITIAL_XML)
        val raw = "{\"type\":\"GetBpmnFileCommand\"}"

        f.router.forwardWebviewMessage(f.session.editorId, raw)

        val spliced = parse(f.wired.fake.nextFrame())
        // The old shape parsed the raw text and nested it under params.message; the
        // spliced frame must be byte-for-byte equivalent once both are re-parsed.
        val expected =
            f.wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "method" to "webview/message",
                        "params" to
                            mapOf(
                                "editorId" to f.session.editorId,
                                "message" to mapOf("type" to "GetBpmnFileCommand"),
                            ),
                    ),
                ).asJsonObject
        assertEquals(expected, spliced, "the spliced frame matches the parse+re-serialize shape")
    }

    @Test
    fun `forwardWebviewMessage drops a non-JSON message instead of framing it`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.forwardWebviewMessage(f.session.editorId, "this is not json")

        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a burst of SyncDocumentCommand forwards coalesces to the latest, non-sync survives`() {
        // The router chooses the coalesce key; the channel then collapses queued
        // sync frames. Observing that deterministically needs the whole flood to
        // coalesce in the deque *before* any writer drains it, so this router runs
        // over a channel that is only attached after the forwards are enqueued
        // (`detach` drops frames rather than holding them, so it can't be used here).
        val project = projectFixture.get()
        val bpmn = createBpmnFile(tempDirFixture.get(), "coalesce.bpmn", INITIAL_XML)
        val handlers = RpcHandlerRegistry()
        val channel = RpcChannel { method, params, id -> handlers.dispatch(method, params, id) }
        val fake = FakeProcess()
        val router = EditorSessionRouter(bridgeDeps(project, channel, handlers), DeterministicScheduler())
        router.register()
        val editorId = bpmn.file.url
        try {
            router.forwardWebviewMessage(editorId, syncCommand("<one/>"))
            router.forwardWebviewMessage(editorId, "{\"type\":\"OtherCommand\"}")
            router.forwardWebviewMessage(editorId, syncCommand("<two/>"))

            channel.attach(fake.outputStream, fake.inputStream)

            val first = parse(fake.nextFrame())
            assertEquals(
                "OtherCommand",
                first.getAsJsonObject("params").getAsJsonObject("message").get("type").asString,
                "the non-sync command is not coalesced and survives in order",
            )
            val second = parse(fake.nextFrame())
            assertEquals(
                "<two/>",
                second.getAsJsonObject("params").getAsJsonObject("message").get("content").asString,
                "only the latest SyncDocumentCommand survives",
            )
            fake.expectNoFrame()
        } finally {
            channel.close()
            fake.close()
            Files.deleteIfExists(bpmn.nioPath)
        }
    }

    @Test
    fun `a host write supersedes a pending external edit, leaving no stale frame`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        // An external edit arrives and parks a debounced send...
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }

        // ...then the core writes back before that debounce fires. The write echo
        // must go out synchronously with causedBy, and the now-stale external send
        // must be dropped — otherwise the bridge would re-render the old XML after
        // dropping its own write by causation.
        val params =
            f.wired.channel.gson
                .toJsonTree(mapOf("editorId" to f.session.editorId, "content" to SECOND_EDIT_XML, "revision" to REVISION))
                .asJsonObject
        f.wired.handlers.dispatch("document/write", params, 1)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertEquals(SECOND_EDIT_XML, didChange.getAsJsonObject("params").get("content").asString)
        assertEquals(
            REVISION,
            didChange.getAsJsonObject("params").get("causedBy").asLong,
            "the host write echo carries causation",
        )
        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt)

        // Fire the parked external timer: its sequence is now stale, so it must abort.
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `requestDiagramSvg posts the command and consumes the echo into the callback`() {
        val project = projectFixture.get()
        val bpmn = createBpmnFile(tempDirFixture.get(), "svg.bpmn", INITIAL_XML)
        val wired = wireChannel()
        val router = EditorSessionRouter(bridgeDeps(project, wired.channel, wired.handlers), DeterministicScheduler())
        router.register()
        val posted = mutableListOf<String>()
        val session = CoreSession(bpmn.file.url, bpmn.file, project) { posted.add(it) }
        router.registerSession(session)
        parse(wired.fake.nextFrame()) // drain the session/register frame

        try {
            var captured: String? = null
            val hadSession = router.requestDiagramSvg(session.editorId) { captured = it }
            assertTrue(hadSession, "a session is open, so the request is accepted")
            assertEquals(
                "{\"type\":\"GetDiagramAsSVGCommand\"}",
                posted.single(),
                "the export command is posted straight into the webview",
            )

            // The webview echoes the command back with the rendered svg populated.
            router.forwardWebviewMessage(
                session.editorId,
                "{\"type\":\"GetDiagramAsSVGCommand\",\"svg\":\"<svg/>\"}",
            )
            assertEquals("<svg/>", captured, "the callback receives the echoed svg")
            // The echo is consumed here, never framed onward to the core.
            wired.fake.expectNoFrame()
        } finally {
            wired.dispose()
            Files.deleteIfExists(bpmn.nioPath)
        }
    }

    @Test
    fun `an svg echo with no pending request still forwards to the core`() {
        val f = setUpRouter(INITIAL_XML)

        // No requestDiagramSvg was issued, so there is no callback to consume this —
        // it must fall through and forward like any other webview message.
        f.router.forwardWebviewMessage(
            f.session.editorId,
            "{\"type\":\"GetDiagramAsSVGCommand\",\"svg\":\"<svg/>\"}",
        )

        val frame = parse(f.wired.fake.nextFrame())
        assertEquals("webview/message", frame.get("method").asString)
        assertEquals(
            "GetDiagramAsSVGCommand",
            frame.getAsJsonObject("params").getAsJsonObject("message").get("type").asString,
            "an unclaimed svg echo forwards unchanged",
        )
    }

    /** The exact compact shape the webview shim's JSON.stringify emits for a sync. */
    private fun syncCommand(content: String): String =
        "{\"type\":\"SyncDocumentCommand\",\"content\":\"$content\"}"

    private companion object {
        const val REVISION = 7L
        const val INITIAL_XML = "<bpmn:definitions id=\"a\"/>\n"
        const val EDITED_XML = "<bpmn:definitions id=\"b\"/>\n"
        const val SECOND_EDIT_XML = "<bpmn:definitions id=\"c\"/>\n"
        const val THIRD_EDIT_XML = "<bpmn:definitions id=\"d\"/>\n"
    }
}
