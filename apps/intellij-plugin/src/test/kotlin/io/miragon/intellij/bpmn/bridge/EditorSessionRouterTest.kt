package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.impl.LaterInvocator
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileDocumentSynchronizationVetoer
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.junit5.RunInEdt
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.tempPathFixture
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit

/**
 * Covers the host side of document sync against a **real** IntelliJ `Document`,
 * the only way to verify that `Document.setText` synchronously fires the editor's
 * `DocumentListener` while [EditorSessionRouter] marks the editor as applying a
 * core write. A fake document could only assume that timing, and the suppression
 * of the core's own write (no `document/didChange` echo) lives in that synchronous
 * re-entrancy.
 *
 * `@RunInEdt(writeIntent = true)` runs each test on the EDT with the write-intent
 * lock so write actions and `invokeLater` pumping work; the annotation only targets
 * the class, and `allMethods` defaults to true, so every `@Test` is covered.
 */
@TestApplication
@RunInEdt(writeIntent = true)
class EditorSessionRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()
    private val tempDirFixture = tempPathFixture()

    private val gson = Gson()

    // Cleaned up in teardown: the bridge threads (ThreadLeakTracker) and the backing
    // file (tempPathFixture only removes the directory when it is empty).
    private var fixture: Fixture? = null
    private val extraFiles = mutableListOf<BpmnTestFile>()

    @AfterEach
    fun tearDown() {
        fixture?.let {
            it.wired.dispose()
            Files.deleteIfExists(it.bpmn.nioPath)
        }
        extraFiles.forEach { Files.deleteIfExists(it.nioPath) }
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    /**
     * Wires a router over a real `.bpmn` Document and an open session, draining the
     * `session/register` frame so the test starts from a quiet channel.
     */
    private fun setUpRouter(
        initialXml: String,
        readDocumentText: (VirtualFile) -> String = ::readDocumentTextInReadAction,
    ): Fixture {
        val project = projectFixture.get()
        val bpmn = createBpmnFile(tempDirFixture.get(), "process.bpmn", initialXml)
        val wired = wireChannel()
        val scheduler = DeterministicScheduler()
        val selectedEditorIds = CopyOnWriteArrayList<String>()
        val router =
            EditorSessionRouter(bridgeDeps(project, wired.channel, wired.handlers), scheduler, readDocumentText) {
                selectedEditorIds.toList()
            }
        router.register()

        val posted = mutableListOf<String>()
        val session = CoreSession(bpmn.file.url, bpmn.file, project) { posted.add(it) }
        router.registerSession(session)
        val register = parse(wired.fake.nextFrame())
        assertEquals(
            "session/register",
            register.get("method").asString,
            "registerSession seeds the core before any document traffic",
        )
        val sessionId = register.getAsJsonObject("params").get("sessionId").asLong
        return Fixture(router, session, sessionId, bpmn, wired, scheduler, posted, selectedEditorIds).also {
            fixture = it
        }
    }

    private class Fixture(
        val router: EditorSessionRouter,
        val session: CoreSession,
        val sessionId: Long,
        val bpmn: BpmnTestFile,
        val wired: WiredBridge,
        val scheduler: DeterministicScheduler,
        val posted: MutableList<String>,
        /** The tabs selected in the editor windows, the focused window's first. */
        val selectedEditorIds: MutableList<String>,
    )

    /**
     * Re-creates the host's real listener wiring from `BpmnFileEditor`: the editor's
     * `DocumentListener` reports every Document change to the router. This is the
     * listener that `handleWrite`'s `setText` re-enters synchronously. Returns how
     * often the router asked for the document text.
     */
    private fun Fixture.attachEditorEcho(editorSession: CoreSession = session): () -> Int {
        var contentReads = 0
        bpmn.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    router.notifyDocumentChanged(editorSession) {
                        contentReads++
                        event.document.text
                    }
                }
            },
            Disposer.newDisposable(session.project, "editor-echo"),
        )
        return { contentReads }
    }

    private fun Fixture.dispatchCoreWrite(content: String, expectedDocumentRevision: Long? = null) {
        val params =
            linkedMapOf<String, Any>("editorId" to session.editorId, "sessionId" to sessionId, "content" to content)
        expectedDocumentRevision?.let { params["expectedDocumentRevision"] = it }
        wired.handlers.dispatch("document/write", wired.channel.gson.toJsonTree(params).asJsonObject, 1)
        // handleWrite defers the mutation to invokeLater; pump it so setText (and the
        // synchronous listener call it triggers) actually runs before we read frames.
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    /** Refuses every save, as IntelliJ does for a memory/disk conflict, without an exception. */
    private fun Fixture.vetoEverySave() {
        ExtensionTestUtil.addExtensions(
            FileDocumentSynchronizationVetoer.EP_NAME,
            listOf(
                object : FileDocumentSynchronizationVetoer() {
                    override fun maySaveDocument(document: Document, isSaveExplicit: Boolean) = false
                },
            ),
            Disposer.newDisposable(session.project, "save-veto"),
        )
    }

    private fun Fixture.dispatchCoreSave() {
        val params = linkedMapOf<String, Any>("editorId" to session.editorId, "sessionId" to sessionId)
        wired.handlers.dispatch("document/save", wired.channel.gson.toJsonTree(params).asJsonObject, 2)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    @Test
    fun `a core write sends no document didChange and never reads the document text`() {
        val f = setUpRouter(INITIAL_XML)
        val contentReads = f.attachEditorEcho()

        f.dispatchCoreWrite(EDITED_XML)

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt, "the write reply is the only frame sent")
        val result = reply.getAsJsonObject("result")
        assertTrue(result.get("changed").asBoolean, "the write changed the document")
        assertFalse(result.has("normalizedContent"), "unnormalised content is not sent back")
        assertEquals(EDITED_XML, f.bpmn.document.text)
        assertEquals(0, contentReads(), "the core's own write is not copied out of the Document")
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a core write the Document refuses still answers the request with an error`() {
        val f = setUpRouter(INITIAL_XML)
        f.bpmn.document.setReadOnly(true)

        f.dispatchCoreWrite(EDITED_XML)

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt)
        assertTrue(reply.has("error"), "a refused write settles the core's request")
        assertEquals(INITIAL_XML, f.bpmn.document.text)
    }

    @Test
    fun `a core write that throws after the Document took the content still answers that it changed`() {
        val f = setUpRouter(INITIAL_XML)
        failNextCommandAfterItRuns(f.session.project, IllegalStateException("listener failed"))

        f.dispatchCoreWrite(EDITED_XML)

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt)
        assertEquals(
            true,
            reply.getAsJsonObject("result")?.get("changed")?.asBoolean,
            "the reply is the mirror's only update",
        )
        assertEquals(EDITED_XML, f.bpmn.document.text)
    }

    @Test
    fun `a save of an open editor writes its Document to disk and answers that it saved`() {
        val f = setUpRouter(INITIAL_XML)
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }

        f.dispatchCoreSave()

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(2, reply.get("id").asInt)
        assertTrue(reply.getAsJsonObject("result").get("saved").asBoolean)
        assertEquals(EDITED_XML, Files.readString(f.bpmn.nioPath))
    }

    @Test
    fun `a save of an unmodified Document answers that it saved`() {
        val f = setUpRouter(INITIAL_XML)

        f.dispatchCoreSave()

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(2, reply.get("id").asInt)
        assertTrue(reply.getAsJsonObject("result").get("saved").asBoolean)
    }

    @Test
    fun `reports a Document that stays unsaved as not saved`() {
        val f = setUpRouter(INITIAL_XML)
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }
        f.vetoEverySave()

        f.dispatchCoreSave()

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(2, reply.get("id").asInt)
        assertFalse(reply.getAsJsonObject("result").get("saved").asBoolean)
        assertTrue(FileDocumentManager.getInstance().isDocumentUnsaved(f.bpmn.document))
        assertEquals(INITIAL_XML, Files.readString(f.bpmn.nioPath))
    }

    @Test
    fun `a save for an editor that is no longer open answers that nothing was saved`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.disposeSession(f.session)
        parse(f.wired.fake.nextFrame()) // drain session/dispose

        f.dispatchCoreSave()

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(2, reply.get("id").asInt)
        assertFalse(reply.getAsJsonObject("result").get("saved").asBoolean)
    }

    @Test
    fun `a core write with CRLF line separators replies the normalised content`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        f.dispatchCoreWrite(EDITED_XML.replace("\n", "\r\n"))

        val result = parse(f.wired.fake.nextFrame()).getAsJsonObject("result")
        assertTrue(result.get("changed").asBoolean)
        assertEquals(EDITED_XML, result.get("normalizedContent").asString)
        assertEquals(EDITED_XML, f.bpmn.document.text)
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `an external edit sends its content and a new document revision`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        // A genuine external edit (git revert, the plain-text tab, another tool).
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
        assertEquals(1L, didChange.getAsJsonObject("params").get("documentRevision").asLong)
    }

    @Test
    fun `close does not flush the webview over a pending external host update`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.notifyDocumentChanged(f.session) { EDITED_XML }
        f.router.flushBeforeClose(f.session.editorId)

        assertTrue(f.posted.isEmpty(), "the authoritative host edit bypasses webview export")
    }

    @Test
    fun `close writes a page edit that never reached the Document`() {
        val f = setUpRouter(INITIAL_XML)
        val page = f.openPageShowing(EDITED_XML)

        f.router.flushBeforeClose(f.session.editorId)

        assertEquals(EDITED_XML, f.bpmn.document.text, "the closing page's edit survives in the Document")
        assertTrue(page.isLocked, "the closing page takes no edit after its export")
    }

    @Test
    fun `close releases a page that did not answer the flush`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.flushBeforeClose(f.session.editorId)

        val posted = f.posted.map(::parse)
        assertEquals(
            listOf("FlushDocumentQuery", "ReleaseDocumentFlushQuery"),
            posted.map { it.get("type").asString },
            "a flush the page answers late cannot leave it locked",
        )
        assertEquals(1, posted.map { it.get("token").asLong }.distinct().size)
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
    fun `editor postMessage delivers the core message to the webview unescaped`() {
        val f = setUpRouter(INITIAL_XML)
        val message =
            mapOf("type" to "BpmnFileQuery", "content" to EDITED_XML, "engine" to "c8", "documentRevision" to 0)
        val params =
            f.wired.channel.gson
                .toJsonTree(mapOf("editorId" to f.session.editorId, "sessionId" to f.sessionId, "message" to message))
                .asJsonObject

        f.wired.handlers.dispatch("editor/postMessage", params, null)

        val delivered = f.posted.single()
        assertEquals(f.wired.channel.gson.toJsonTree(message), parse(delivered))
        assertTrue(delivered.contains("<bpmn:definitions id="), "XML reaches the webview without HTML escapes")
    }

    @Test
    fun `forwardWebviewMessage splices the raw message into the same frame shape as a parse+reserialize`() {
        val f = setUpRouter(INITIAL_XML)
        val raw = "{\"type\":\"GetBpmnFileCommand\"}"

        f.router.forwardWebviewMessage(f.session, raw)

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
                                "sessionId" to f.sessionId,
                                "message" to mapOf("type" to "GetBpmnFileCommand"),
                            ),
                    ),
                ).asJsonObject
        assertEquals(expected, spliced, "the spliced frame matches the parse+re-serialize shape")
    }

    @Test
    fun `forwardWebviewMessage drops a non-JSON message instead of framing it`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.forwardWebviewMessage(f.session, "this is not json")

        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a sync is dropped while an external host update is pending`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.notifyDocumentChanged(f.session) { EDITED_XML }

        f.router.forwardWebviewMessage(f.session, syncCommand("<stale/>", 0))

        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a sync older than the latest delivered host revision is dropped`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.notifyDocumentChanged(f.session) { EDITED_XML }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        parse(f.wired.fake.nextFrame()) // drain document/didChange
        val query =
            f.wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "editorId" to f.session.editorId,
                        "message" to
                            mapOf(
                                "type" to "BpmnFileQuery",
                                "content" to EDITED_XML,
                                "engine" to "c8",
                                "documentRevision" to 1,
                            ),
                    ),
                ).asJsonObject
        f.wired.handlers.dispatch("editor/postMessage", query, null)

        f.router.forwardWebviewMessage(f.session, syncCommand("<stale/>", 0))

        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a transformed query acknowledges the host revision it represents`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.notifyDocumentChanged(f.session) { "" }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        parse(f.wired.fake.nextFrame()) // drain document/didChange revision 1
        val transformed =
            f.wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "editorId" to f.session.editorId,
                        "sessionId" to f.sessionId,
                        "message" to
                            mapOf(
                                "type" to "BpmnFileQuery",
                                "content" to EDITED_XML,
                                "engine" to "c8",
                                "documentRevision" to 1,
                            ),
                    ),
                ).asJsonObject
        f.wired.handlers.dispatch("editor/postMessage", transformed, null)

        f.router.forwardWebviewMessage(f.session, syncCommand("<edited/>", 1))

        val forwarded = parse(f.wired.fake.nextFrame())
        assertEquals("webview/message", forwarded.get("method").asString)
        assertEquals(
            "<edited/>",
            forwarded.getAsJsonObject("params").getAsJsonObject("message").get("content").asString,
        )
    }

    @Test
    fun `re-registering after a host edit preserves the session revision`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.notifyDocumentChanged(f.session) { EDITED_XML }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals(1L, didChange.getAsJsonObject("params").get("documentRevision").asLong)

        f.router.reregisterLiveSessions()

        val register = parse(f.wired.fake.nextFrame())
        val params = register.getAsJsonObject("params")
        assertEquals(f.sessionId, params.get("sessionId").asLong)
        assertEquals(1L, params.get("documentRevision").asLong)
        val replay = parse(f.wired.fake.nextFrame())
        assertEquals("webview/message", replay.get("method").asString)
        assertEquals(f.sessionId, replay.getAsJsonObject("params").get("sessionId").asLong)
    }

    @Test
    fun `a respawn replay asks the new bridge for the lint config after the file`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.reregisterLiveSessions()

        val frames = List(3) { parse(f.wired.fake.nextFrame()) }
        assertEquals(
            listOf("session/register", "GetBpmnFileCommand", "GetBpmnlintConfigCommand"),
            frames.map { it.webviewMessageType() ?: it.get("method").asString },
            "the page keeps the old bridge's lint state until the new bridge pushes its own",
        )
        frames.forEach { assertEquals(f.sessionId, it.getAsJsonObject("params").get("sessionId").asLong) }
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a respawn replay tells the new bridge which editor is selected`() {
        val f = setUpRouter(INITIAL_XML)
        val selected = f.openPageShowing(INITIAL_XML, editedSinceRender = false)
        f.openPageShowing(INITIAL_XML, createSecondBpmnFile(), editedSinceRender = false)
        f.selectedEditorIds.add(selected.session.editorId)

        f.router.reregisterLiveSessions()

        assertEquals(
            listOf(selected.session.editorId to selected.sessionId),
            f.wired.fake.framesUntilQuiet().map(::parse).focusFramesAfterLastRegister(),
            "the bridge takes every register for the focused tab, so the last one replayed would keep the target",
        )
    }

    @Test
    fun `a respawn replay focuses the diagram another split shows when the focused tab is no diagram`() {
        val f = setUpRouter(INITIAL_XML)
        f.openPageShowing(INITIAL_XML, editedSinceRender = false)
        val shownInOtherSplit = f.openPageShowing(INITIAL_XML, createSecondBpmnFile(), editedSinceRender = false)
        f.selectedEditorIds.addAll(listOf(TEXT_TAB_EDITOR_ID, shownInOtherSplit.session.editorId))

        f.router.reregisterLiveSessions()

        assertEquals(
            listOf(shownInOtherSplit.session.editorId to shownInOtherSplit.sessionId),
            f.wired.fake.framesUntilQuiet().map(::parse).focusFramesAfterLastRegister(),
        )
    }

    @Test
    fun `re-registering keeps a page edit that never reached the Document`() {
        val f = setUpRouter(INITIAL_XML)
        // The sync of this edit was dropped in the restart window: the page shows
        // it and believes it is clean, the Document does not have it.
        val page = f.openPageShowing(EDITED_XML)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val register =
            f.reregistrationFrames().single { it.get("method").asString == "session/register" }
        assertEquals(
            EDITED_XML,
            f.bpmn.document.text,
            "the replayed render re-imports the Document, so it must hold the page's edit first",
        )
        val registered = register.getAsJsonObject("params")
        assertEquals(
            EDITED_XML,
            registered.get("content").asString,
            "the respawned bridge is seeded with the page's edit",
        )
        assertTrue(page.isLocked, "the page takes no new edits before the replayed render")

        f.deliverRenderedFile(page, registered.get("content").asString)
        assertFalse(page.isLocked, "the page is unlocked once the replayed render reached it")
    }

    @Test
    fun `a clean flush reply keeps the Document even when the page's sync lands during the wait`() {
        val f = setUpRouter(INITIAL_XML)
        // A host render replaced the page's edit after its sync went out.
        lateinit var page: FakePage
        page =
            f.openPageShowing(EDITED_XML, editedSinceRender = false) { reply ->
                f.router.forwardWebviewMessage(page.session, syncCommand(EDITED_XML, 0))
                reply()
            }

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val query = page.flushQueries.single()
        assertTrue(
            query.get("destructive").asBoolean && query.get("exportWhenEdited").asBoolean,
            "recovery asks the page for any edit since its last render",
        )
        val register =
            f.reregistrationFrames().single { it.get("method").asString == "session/register" }
        assertEquals(INITIAL_XML, f.bpmn.document.text, "the page shows the host's copy, not its replaced edit")
        assertEquals(INITIAL_XML, register.getAsJsonObject("params").get("content").asString)
    }

    @Test
    fun `a recovered page edit is not rendered back as an external edit`() {
        val f = setUpRouter(INITIAL_XML)
        val page = f.openPageShowing(EDITED_XML)
        f.attachEditorEcho(page.session)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val register =
            f.reregistrationFrames().single { it.get("method").asString == "session/register" }
        assertEquals(
            0L,
            register.getAsJsonObject("params").get("documentRevision").asLong,
            "the page already represents its own edit",
        )
        f.deliverRenderedFile(page, EDITED_XML)
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a recovered page takes edits again when the replayed render never arrives`() {
        val f = setUpRouter(INITIAL_XML)
        val page = f.openPageShowing(EDITED_XML)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        f.scheduler.runPending()

        assertFalse(page.isLocked, "a bridge that never renders must not leave the page inert")
    }

    @Test
    fun `a crash recovery that finishes after Reload Modeler still lets the replayed render unlock the page`() {
        val f = setUpRouter(INITIAL_XML)
        val crashFlushAnswered = CountDownLatch(1)
        val page =
            f.openPageShowing(EDITED_XML) { reply ->
                reply()
                crashFlushAnswered.countDown()
            }

        // Reload Modeler runs on the EDT while the crash path waits for the EDT to write its reply.
        val crashRecovery = ApplicationManager.getApplication().executeOnPooledThread(Runnable { f.router.reregisterLiveSessions() })
        assertTrue(crashFlushAnswered.await(10, TimeUnit.SECONDS))
        f.router.reregisterLiveSessions()
        PlatformTestUtil.waitForFuture(crashRecovery, 10_000)

        f.deliverRenderedFile(page, EDITED_XML)
        assertFalse(page.isLocked, "the page holds the token of the last flush it received")
    }

    @Test
    fun `a save while a crash recovery waits still lets the replayed render unlock the page`() {
        val f = setUpRouter(INITIAL_XML)
        val crashFlushAnswered = CountDownLatch(1)
        val page =
            f.openPageShowing(EDITED_XML) { reply ->
                reply()
                crashFlushAnswered.countDown()
            }

        // Switching away from the IDE saves on the EDT while the crash path waits for the EDT to write its reply.
        val crashRecovery = ApplicationManager.getApplication().executeOnPooledThread(Runnable { f.router.reregisterLiveSessions() })
        assertTrue(crashFlushAnswered.await(10, TimeUnit.SECONDS))
        FileDocumentManager.getInstance().saveAllDocuments()
        PlatformTestUtil.waitForFuture(crashRecovery, 10_000)

        f.deliverRenderedFile(page, EDITED_XML)
        assertFalse(page.isLocked, "a save's flush takes no lock, so the recovery still holds the page's")
    }

    @Test
    fun `a crash recovery that flushes while a tab close waits still lets the close write the page edit`() {
        val f = setUpRouter(INITIAL_XML)
        val closingThread = Thread.currentThread()
        lateinit var crashRecovery: Future<*>
        var answerCloseFlush: (() -> Unit)? = null
        val page =
            f.openPageShowing(EDITED_XML) { reply ->
                val closeFlushReply = answerCloseFlush
                if (closeFlushReply == null) {
                    answerCloseFlush = reply
                    crashRecovery = runOnceParked(closingThread) { f.router.reregisterLiveSessions() }
                } else {
                    closeFlushReply()
                    reply()
                }
            }

        f.router.flushBeforeClose(page.session.editorId)
        f.router.disposeSession(page.session)
        PlatformTestUtil.waitForFuture(crashRecovery, 10_000)

        assertEquals(EDITED_XML, f.bpmn.document.text, "the recovery's flush does not take the close's reply")
    }

    @Test
    fun `a sync forced while a tab close and a crash recovery both wait reaches the close`() {
        val f = setUpRouter(INITIAL_XML)
        val closingThread = Thread.currentThread()
        lateinit var crashRecovery: Future<*>
        lateinit var page: FakePage
        page =
            f.openPageShowing(EDITED_XML) { _ ->
                if (page.flushQueries.size == 1) {
                    crashRecovery = runOnceParked(closingThread) { f.router.reregisterLiveSessions() }
                } else {
                    // The page's export fails after its forced sync went out.
                    f.router.forwardWebviewMessage(page.session, syncCommand(EDITED_XML, 0))
                    page.flushQueries.forEach {
                        f.router.forwardWebviewMessage(page.session, unavailableFlushReply(it.get("token").asLong))
                    }
                }
            }

        f.router.flushBeforeClose(page.session.editorId)
        f.router.disposeSession(page.session)
        PlatformTestUtil.waitForFuture(crashRecovery, 10_000)

        assertEquals(EDITED_XML, f.bpmn.document.text, "every flush in flight keeps the forced sync")
    }

    @Test
    fun `re-registering does not flush the webview over a pending external host update`() {
        val f = setUpRouter(INITIAL_XML)

        f.router.notifyDocumentChanged(f.session) { EDITED_XML }
        f.router.reregisterLiveSessions()

        assertTrue(f.posted.isEmpty(), "the authoritative host edit bypasses webview export")
    }

    @Test
    fun `re-registering does not flush the webview over a host update that has not reached it yet`() {
        val f = setUpRouter(INITIAL_XML)
        f.router.notifyDocumentChanged(f.session) { EDITED_XML }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        assertEquals("document/didChange", parse(f.wired.fake.nextFrame()).get("method").asString)

        f.router.reregisterLiveSessions()

        assertTrue(f.posted.isEmpty(), "the sent host edit stays authoritative until the core posts it to the page")
    }

    @Test
    fun `a respawn off the EDT writes the page edit on the EDT before it re-registers`() {
        val f = setUpRouter(INITIAL_XML)
        f.openPageShowing(EDITED_XML)

        val respawn = ApplicationManager.getApplication().executeOnPooledThread(Runnable { f.router.reregisterLiveSessions() })
        PlatformTestUtil.waitForFuture(respawn, 10_000)

        val register =
            f.reregistrationFrames().single { it.get("method").asString == "session/register" }
        assertEquals(EDITED_XML, f.bpmn.document.text, "the scheduler thread hands the write to the EDT")
        assertEquals(EDITED_XML, register.getAsJsonObject("params").get("content").asString)
    }

    @Test
    fun `a respawn off the EDT with nothing to write does not wait for a modal dialog`() {
        val f = setUpRouter(INITIAL_XML)
        val page = f.openPageShowing(EDITED_XML, editedSinceRender = false)
        val dialog = Any()

        val respawn = ApplicationManager.getApplication().executeOnPooledThread(Runnable { f.router.reregisterLiveSessions() })
        LaterInvocator.enterModal(dialog)
        try {
            PlatformTestUtil.waitForFuture(respawn, 10_000)
        } finally {
            LaterInvocator.leaveModal(dialog)
            PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        }

        assertEquals(
            REREGISTRATION_FRAMES,
            f.reregistrationFrames().bySession()[page.sessionId],
            "a page with nothing to write is re-registered while the dialog is open",
        )
    }

    @Test
    fun `a Document that refuses the recovered edit leaves the other pages recovering`() {
        val f = setUpRouter(INITIAL_XML)
        val readOnlyPage = f.openPageShowing(EDITED_XML)
        f.bpmn.document.setReadOnly(true)
        val second = createSecondBpmnFile()
        val writablePage = f.openPageShowing(SECOND_EDIT_XML, second)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(INITIAL_XML, f.bpmn.document.text)
        assertEquals(SECOND_EDIT_XML, second.document.text, "one refused write does not stop the others")
        assertEquals(
            mapOf(readOnlyPage.sessionId to REREGISTRATION_FRAMES, writablePage.sessionId to REREGISTRATION_FRAMES),
            f.reregistrationFrames(sessionCount = 2).bySession(),
            "every session is re-registered and replayed",
        )
        f.deliverRenderedFile(readOnlyPage, INITIAL_XML)
        f.deliverRenderedFile(writablePage, SECOND_EDIT_XML)
        assertFalse(readOnlyPage.isLocked || writablePage.isLocked, "no page is left locked")
    }

    @Test
    fun `a page whose flush post throws leaves the other pages recovering`() {
        val f = setUpRouter(INITIAL_XML)
        val unreachablePage =
            CoreSession(f.bpmn.file.url, f.bpmn.file, f.session.project) {
                throw IllegalStateException("the page's browser is gone")
            }
        f.router.registerSession(unreachablePage)
        val unreachableSessionId = parse(f.wired.fake.nextFrame()).getAsJsonObject("params").get("sessionId").asLong
        val second = createSecondBpmnFile()
        val page = f.openPageShowing(SECOND_EDIT_XML, second)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(SECOND_EDIT_XML, second.document.text, "one failed post does not stop the others")
        assertEquals(
            mapOf(unreachableSessionId to REREGISTRATION_FRAMES, page.sessionId to REREGISTRATION_FRAMES),
            f.reregistrationFrames(sessionCount = 2).bySession(),
            "every session is re-registered and replayed",
        )
        assertTrue(page.isLocked, "the other page is held until its replayed render")
        f.deliverRenderedFile(page, SECOND_EDIT_XML)
        assertFalse(page.isLocked)
    }

    @Test
    fun `an external edit during the flush wait wins over the page's export`() {
        val f = setUpRouter(INITIAL_XML)
        val page =
            f.openPageShowing(EDITED_XML) { reply ->
                WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(SECOND_EDIT_XML) }
                reply()
            }
        f.attachEditorEcho(page.session)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(SECOND_EDIT_XML, f.bpmn.document.text, "the page exported before the external edit landed")
    }

    @Test
    fun `a page export of an older Document revision is not written`() {
        val f = setUpRouter(INITIAL_XML)
        // The core posts revision 1 to the page, which still exports what it showed at revision 0.
        val page = f.openPageShowing(EDITED_XML, pageRevision = 0)
        f.attachEditorEcho(page.session)
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(SECOND_EDIT_XML) }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        assertEquals("document/didChange", parse(f.wired.fake.nextFrame()).get("method").asString)
        f.deliverRenderedFile(page, SECOND_EDIT_XML, documentRevision = 1)

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(SECOND_EDIT_XML, f.bpmn.document.text, "the export predates the page's newest host revision")
    }

    @Test
    fun `a page closed during the flush wait is neither written nor re-registered`() {
        val f = setUpRouter(INITIAL_XML)
        lateinit var page: FakePage
        page =
            f.openPageShowing(EDITED_XML) { reply ->
                reply()
                f.router.disposeSession(page.session)
            }

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(INITIAL_XML, f.bpmn.document.text, "a closed page's export is not written")
        assertEquals("DocumentFlushedCommand", parse(f.wired.fake.nextFrame()).webviewMessageType())
        assertEquals("session/dispose", parse(f.wired.fake.nextFrame()).get("method").asString)
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a session closed while its re-register frame is built ends up disposed in the bridge`() {
        var closeWhileRegisterFrameIsBuilt: (() -> Unit)? = null
        val f =
            setUpRouter(INITIAL_XML) { file ->
                closeWhileRegisterFrameIsBuilt?.invoke()
                closeWhileRegisterFrameIsBuilt = null
                readDocumentTextInReadAction(file)
            }
        val page = f.openPageShowing(INITIAL_XML, editedSinceRender = false)
        closeWhileRegisterFrameIsBuilt = { f.router.disposeSession(page.session) }

        f.router.reregisterLiveSessions()

        val framesForClosedSession = f.wired.fake.framesUntilQuiet().map(::parse).labelsFor(page)
        assertEquals(
            "session/dispose",
            framesForClosedSession.lastOrNull(),
            "the new bridge must not keep a session for a closed tab: $framesForClosedSession",
        )
    }

    @Test
    fun `a session closed while its re-register frame is built leaves the other sessions recovering`() {
        var closeWhileRegisterFrameIsBuilt: ((VirtualFile) -> Unit)? = null
        val f =
            setUpRouter(INITIAL_XML) { file ->
                closeWhileRegisterFrameIsBuilt?.invoke(file)
                closeWhileRegisterFrameIsBuilt = null
                readDocumentTextInReadAction(file)
            }
        val pages =
            listOf(
                f.openPageShowing(INITIAL_XML, editedSinceRender = false),
                f.openPageShowing(INITIAL_XML, createSecondBpmnFile(), editedSinceRender = false),
            )
        lateinit var closedPage: FakePage
        // The sessions map has no fixed iteration order: close whichever page re-registers first.
        closeWhileRegisterFrameIsBuilt = { file ->
            closedPage = pages.single { it.session.file == file }
            f.router.disposeSession(closedPage.session)
        }

        f.router.reregisterLiveSessions()

        val frames = f.wired.fake.framesUntilQuiet().map(::parse)
        val framesForClosedSession = frames.labelsFor(closedPage)
        assertEquals(
            "session/dispose",
            framesForClosedSession.lastOrNull(),
            "the new bridge must not keep a session for a closed tab: $framesForClosedSession",
        )
        assertEquals(
            listOf("DocumentFlushedCommand") + REREGISTRATION_FRAMES,
            frames.labelsFor(pages.single { it !== closedPage }),
            "a tab closed mid-recovery does not stop the open tab's re-register and replays",
        )
    }

    @Test
    fun `a page closed before its replayed render gets no release`() {
        val f = setUpRouter(INITIAL_XML)
        val page = f.openPageShowing(EDITED_XML)
        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        f.router.disposeSession(page.session)
        f.scheduler.runPending()

        assertFalse("ReleaseDocumentFlushQuery" in page.received, "a closed page's browser is gone")
    }

    @Test
    fun `pages that answer from another thread while the host waits get their edits written`() {
        val f = setUpRouter(INITIAL_XML)
        f.openPageShowing(EDITED_XML, whileHostWaits = replyOnceHostWaits())
        val second = createSecondBpmnFile()
        f.openPageShowing(SECOND_EDIT_XML, second, whileHostWaits = replyOnceHostWaits())

        f.router.reregisterLiveSessions()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        assertEquals(EDITED_XML, f.bpmn.document.text)
        assertEquals(SECOND_EDIT_XML, second.document.text, "both replies land within the one shared wait")
    }

    @Test
    fun `a recovery interrupted while it waits writes nothing and still re-registers every page`() {
        val f = setUpRouter(INITIAL_XML)
        val answered = f.openPageShowing(EDITED_XML)
        val second = createSecondBpmnFile()
        val unanswered = f.openPageShowing(SECOND_EDIT_XML, second) { Thread.currentThread().interrupt() }

        val respawn = ApplicationManager.getApplication().executeOnPooledThread(Runnable { f.router.reregisterLiveSessions() })
        PlatformTestUtil.waitForFuture(respawn, 10_000)

        assertEquals(INITIAL_XML, f.bpmn.document.text, "an interrupted recovery leaves every Document alone")
        assertEquals(
            mapOf(answered.sessionId to REREGISTRATION_FRAMES, unanswered.sessionId to REREGISTRATION_FRAMES),
            f.reregistrationFrames(sessionCount = 2).bySession(),
            "the replay still goes out after an interrupted wait",
        )
    }

    /** Replies from another thread once the host thread parks to wait for the reply. */
    private fun replyOnceHostWaits(): (reply: () -> Unit) -> Unit = { reply -> runOnceParked(Thread.currentThread(), reply) }

    /** Runs [action] on a pooled thread once [thread] parks in a timed wait. */
    private fun runOnceParked(thread: Thread, action: () -> Unit): Future<*> =
        ApplicationManager.getApplication().executeOnPooledThread(
            Runnable {
                val giveUpAt = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
                while (thread.state != Thread.State.TIMED_WAITING && System.nanoTime() < giveUpAt) Thread.onSpinWait()
                action()
            },
        )

    /**
     * Opens a page on [file] (by default replacing the fixture's page) that
     * answers a flush the way the page's flush responder does when it exports
     * [content] at [pageRevision] with no sync pending: only a page
     * [editedSinceRender] gets the content, and only for a destructive flush
     * that asks for an edit whose sync already went out; any other flush gets
     * `clean`. Like the responder, the page keeps only the token of the last
     * destructive flush it received. [whileHostWaits] wraps the reply, to play
     * what happens while the host waits for it.
     */
    private fun Fixture.openPageShowing(
        content: String,
        file: BpmnTestFile = bpmn,
        pageRevision: Long = 0,
        editedSinceRender: Boolean = true,
        whileHostWaits: (reply: () -> Unit) -> Unit = { reply -> reply() },
    ): FakePage {
        val page = FakePage()
        page.session =
            CoreSession(file.file.url, file.file, session.project) { raw ->
                val message = parse(raw)
                val type = message.get("type")?.asString ?: return@CoreSession
                page.received.add(type)
                val token = message.get("token")?.asLong ?: return@CoreSession
                when (type) {
                    "FlushDocumentQuery" -> {
                        val destructive = message.get("destructive")?.asBoolean == true
                        page.flushQueries.add(message)
                        if (destructive) page.lockToken = token
                        val exportsSyncedEdit =
                            destructive && editedSinceRender && message.get("exportWhenEdited")?.asBoolean == true
                        val reply: Map<String, Any> =
                            if (exportsSyncedEdit) {
                                linkedMapOf(
                                    "type" to "DocumentFlushedCommand",
                                    "token" to token,
                                    "content" to content,
                                    "status" to "flushed",
                                    "documentRevision" to pageRevision,
                                )
                            } else {
                                linkedMapOf("type" to "DocumentFlushedCommand", "token" to token, "status" to "clean")
                            }
                        whileHostWaits { router.forwardWebviewMessage(page.session, wired.channel.gson.toJson(reply)) }
                    }
                    "ReleaseDocumentFlushQuery" -> if (page.lockToken == token) page.lockToken = null
                }
            }
        router.registerSession(page.session)
        page.sessionId = parse(wired.fake.nextFrame()).getAsJsonObject("params").get("sessionId").asLong
        return page
    }

    /** [received] lists the type of every message the host posted into the page, [flushQueries] each flush query. */
    private class FakePage {
        lateinit var session: CoreSession
        var sessionId = 0L

        @Volatile
        var lockToken: Long? = null
        val received: MutableList<String> = CopyOnWriteArrayList()
        val flushQueries: MutableList<JsonObject> = CopyOnWriteArrayList()

        val isLocked: Boolean get() = lockToken != null
    }

    /** A second open diagram next to the fixture's, removed in teardown. */
    private fun createSecondBpmnFile(): BpmnTestFile =
        createBpmnFile(tempDirFixture.get(), "second.bpmn", INITIAL_XML).also { extraFiles.add(it) }

    /** Plays the bridge answering the replayed `GetBpmnFileCommand` with [content]. */
    private fun Fixture.deliverRenderedFile(page: FakePage, content: String, documentRevision: Long = 0) {
        val rendered =
            wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "editorId" to page.session.editorId,
                        "sessionId" to page.sessionId,
                        "message" to
                            mapOf(
                                "type" to "BpmnFileQuery",
                                "content" to content,
                                "engine" to "c8",
                                "documentRevision" to documentRevision,
                            ),
                    ),
                ).asJsonObject
        wired.handlers.dispatch("editor/postMessage", rendered, null)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    /**
     * Reads the frames a re-registration of [sessionCount] sessions sends,
     * through the last replayed command.
     */
    private fun Fixture.reregistrationFrames(sessionCount: Int = 1): List<JsonObject> {
        val frames = mutableListOf<JsonObject>()
        var replayedSessions = 0
        while (replayedSessions < sessionCount) {
            val frame = parse(wired.fake.nextFrame())
            frames.add(frame)
            if (frame.webviewMessageType() == "GetBpmnlintConfigCommand") replayedSessions++
        }
        return frames
    }

    /** The editor and session each `session/setActive` names that follows the last `session/register`. */
    private fun List<JsonObject>.focusFramesAfterLastRegister(): List<Pair<String, Long>> =
        drop(indexOfLast { it.get("method").asString == "session/register" } + 1)
            .filter { it.get("method").asString == "session/setActive" }
            .map { frame ->
                val params = frame.getAsJsonObject("params")
                params.get("editorId").asString to params.get("sessionId").asLong
            }

    /** The register and replay frames each session got, in the order it got them. */
    private fun List<JsonObject>.bySession(): Map<Long, List<String>> =
        map { it.getAsJsonObject("params").get("sessionId").asLong to it.frameLabel() }
            .filter { (_, label) -> label in REREGISTRATION_FRAMES }
            .groupBy({ it.first }, { it.second })

    /**
     * The label of every frame addressed to [page]'s session: the bridge finds
     * a session by its editorId, then checks the sessionId.
     */
    private fun List<JsonObject>.labelsFor(page: FakePage): List<String> =
        filter { frame ->
            val params = frame.getAsJsonObject("params")
            params.get("editorId")?.asString == page.session.editorId &&
                params.get("sessionId")?.asLong == page.sessionId
        }.map { it.frameLabel() }

    @Test
    fun `late traffic and disposal from a replaced same-uri session are ignored`() {
        val f = setUpRouter(INITIAL_XML)
        val replacement = CoreSession(f.session.editorId, f.bpmn.file, f.session.project) {}

        f.router.registerSession(replacement)
        val replacementRegister = parse(f.wired.fake.nextFrame())
        val replacementId = replacementRegister.getAsJsonObject("params").get("sessionId").asLong
        assertNotEquals(f.sessionId, replacementId)

        f.router.forwardWebviewMessage(f.session, "{\"type\":\"OtherCommand\"}")
        f.router.disposeSession(f.session)
        f.wired.fake.expectNoFrame()

        f.router.forwardWebviewMessage(replacement, "{\"type\":\"OtherCommand\"}")
        val forwarded = parse(f.wired.fake.nextFrame())
        assertEquals(replacementId, forwarded.getAsJsonObject("params").get("sessionId").asLong)
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
        val session = CoreSession(editorId, bpmn.file, project) {}
        router.registerSession(session)
        try {
            router.forwardWebviewMessage(session, syncCommand("<one/>"))
            router.forwardWebviewMessage(session, "{\"type\":\"OtherCommand\"}")
            router.forwardWebviewMessage(session, syncCommand("<two/>"))

            channel.attach(fake.outputStream, fake.inputStream)

            assertEquals("session/register", parse(fake.nextFrame()).get("method").asString)
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
    fun `a pending external edit rejects an already-forwarded core write`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()

        // An external edit arrives and parks a debounced send...
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }

        // ...then an older core write reaches the host before that debounce fires.
        // The authoritative external edit must remain in the IntelliJ Document.
        val params =
            f.wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "editorId" to f.session.editorId,
                        "content" to SECOND_EDIT_XML,
                        "expectedDocumentRevision" to 0,
                    ),
                )
                .asJsonObject
        f.wired.handlers.dispatch("document/write", params, 1)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val reply = parse(f.wired.fake.nextFrame())
        assertEquals(1, reply.get("id").asInt)
        assertFalse(reply.getAsJsonObject("result").get("accepted").asBoolean)
        assertEquals(EDITED_XML, f.bpmn.document.text)

        // The parked authoritative update still reaches the core.
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertEquals(EDITED_XML, didChange.getAsJsonObject("params").get("content").asString)
        f.wired.fake.expectNoFrame()
    }

    @Test
    fun `a matching revision transformation write is accepted after the host update is delivered`() {
        val f = setUpRouter(INITIAL_XML)
        f.attachEditorEcho()
        WriteCommandAction.runWriteCommandAction(f.session.project) { f.bpmn.document.setText(EDITED_XML) }
        f.scheduler.runPending()
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
        parse(f.wired.fake.nextFrame()) // drain document/didChange revision 1
        val params =
            f.wired.channel.gson
                .toJsonTree(
                    mapOf(
                        "editorId" to f.session.editorId,
                        "sessionId" to f.sessionId,
                        "content" to SECOND_EDIT_XML,
                        "expectedDocumentRevision" to 1,
                    ),
                ).asJsonObject

        f.wired.handlers.dispatch("document/write", params, 1)
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()

        val reply = parse(f.wired.fake.nextFrame())
        assertTrue(reply.getAsJsonObject("result").get("accepted").asBoolean)
        assertEquals(SECOND_EDIT_XML, f.bpmn.document.text)
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
                session,
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
            f.session,
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

    private fun JsonObject.webviewMessageType(): String? =
        getAsJsonObject("params").getAsJsonObject("message")?.get("type")?.asString

    /** The forwarded webview message's type, or the frame's method. */
    private fun JsonObject.frameLabel(): String = webviewMessageType() ?: get("method").asString

    /** The exact compact shape the webview shim's JSON.stringify emits for a sync. */
    private fun syncCommand(content: String, documentRevision: Long? = null): String {
        val revision = documentRevision?.let { ",\"documentRevision\":$it" }.orEmpty()
        return "{\"type\":\"SyncDocumentCommand\",\"content\":${gson.toJson(content)}$revision}"
    }

    /** What the page answers when its export fails. */
    private fun unavailableFlushReply(token: Long) =
        "{\"type\":\"DocumentFlushedCommand\",\"token\":$token,\"status\":\"unavailable\"}"

    private companion object {
        const val INITIAL_XML = "<bpmn:definitions id=\"a\"/>\n"
        const val EDITED_XML = "<bpmn:definitions id=\"b\"/>\n"
        const val SECOND_EDIT_XML = "<bpmn:definitions id=\"c\"/>\n"
        const val THIRD_EDIT_XML = "<bpmn:definitions id=\"d\"/>\n"

        val REREGISTRATION_FRAMES = listOf("session/register", "GetBpmnFileCommand", "GetBpmnlintConfigCommand")

        const val TEXT_TAB_EDITOR_ID = "file:///notes.txt"
    }
}
