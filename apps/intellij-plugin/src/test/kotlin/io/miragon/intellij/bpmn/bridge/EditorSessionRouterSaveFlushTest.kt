package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.Disposable
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.junit5.RunInEdt
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.tempPathFixture
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.util.Collections

/**
 * IntelliJ saves on the EDT (Ctrl+S, autosave, the save on frame deactivation),
 * while the webview syncs its edits after a 300 ms debounce. A save inside that
 * window must still write the webview's last edit.
 *
 * The fake webview answers a `FlushDocumentQuery` from another thread, as the
 * JCEF handler thread does, because the save holds the EDT.
 */
@TestApplication
@RunInEdt(writeIntent = true)
class EditorSessionRouterSaveFlushTest {
    private val projectFixture = projectFixtureWithoutServicePreload()
    private val tempDirFixture = tempPathFixture()

    private val gson = Gson()

    private var fixture: Fixture? = null

    @AfterEach
    fun tearDown() {
        fixture?.let {
            it.webview.joinReplies()
            Disposer.dispose(it.routerLifetime)
            it.wired.dispose()
            Files.deleteIfExists(it.bpmn.nioPath)
        }
    }

    private class Fixture(
        val sessionId: Long,
        val bpmn: BpmnTestFile,
        val wired: WiredBridge,
        val webview: FakeWebview,
        val routerLifetime: Disposable,
    )

    /**
     * Holds the edit the page has made but not synced yet, and answers flush
     * queries with it. Before each answer it sends [messagesBeforeAnswer]: a
     * reply to a flush another requester asked for, or a sync its debounce fired.
     */
    private inner class FakeWebview(val unsyncedContent: String?, val messagesBeforeAnswer: List<String>) {
        lateinit var router: EditorSessionRouter
        lateinit var session: CoreSession
        val flushQueries: MutableList<JsonObject> = Collections.synchronizedList(mutableListOf())
        private val replyThreads = Collections.synchronizedList(mutableListOf<Thread>())

        fun receive(message: String) {
            val query = gson.fromJson(message, JsonObject::class.java)
            if (query.get("type")?.asString != "FlushDocumentQuery") return
            flushQueries.add(query)
            val reply =
                linkedMapOf<String, Any?>("type" to "DocumentFlushedCommand", "token" to query.get("token").asLong)
            if (unsyncedContent == null) {
                reply["status"] = "clean"
            } else {
                reply["content"] = unsyncedContent
                reply["status"] = "flushed"
                reply["documentRevision"] = 0
            }
            val replyJson = gson.toJson(reply)
            val replies = messagesBeforeAnswer + replyJson
            Thread({ replies.forEach { router.forwardWebviewMessage(session, it) } }, "fake-jcef-reply").also {
                replyThreads.add(it)
                it.start()
            }
        }

        fun joinReplies() {
            replyThreads.toList().forEach { it.join(5_000) }
        }
    }

    private fun setUpRouter(
        initialXml: String,
        unsyncedWebviewXml: String?,
        messagesBeforeAnswer: List<String> = emptyList(),
    ): Fixture {
        val project = projectFixture.get()
        val bpmn = createBpmnFile(tempDirFixture.get(), "process.bpmn", initialXml)
        val wired = wireChannel()
        val routerLifetime = Disposer.newDisposable("save-flush-router")
        val router =
            EditorSessionRouter(bridgeDeps(project, wired.channel, wired.handlers, routerLifetime), DeterministicScheduler())
        router.register()

        val webview = FakeWebview(unsyncedWebviewXml, messagesBeforeAnswer)
        val session = CoreSession(bpmn.file.url, bpmn.file, project) { webview.receive(it) }
        webview.router = router
        webview.session = session
        router.registerSession(session)
        val register = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        val sessionId = register.getAsJsonObject("params").get("sessionId").asLong
        return Fixture(sessionId, bpmn, wired, webview, routerLifetime).also { fixture = it }
    }

    /** The core's `document/write` for a webview sync, applied on the EDT as the host does. */
    private fun Fixture.dispatchCoreWrite(content: String, expectedDocumentRevision: Long? = null) {
        val params =
            linkedMapOf<String, Any>("editorId" to bpmn.file.url, "sessionId" to sessionId, "content" to content)
        expectedDocumentRevision?.let { params["expectedDocumentRevision"] = it }
        wired.handlers.dispatch("document/write", wired.channel.gson.toJsonTree(params).asJsonObject, wired.requestId(1))
        PlatformTestUtil.dispatchAllInvocationEventsInIdeEventQueue()
    }

    private fun syncCommand(content: String): String =
        gson.toJson(linkedMapOf("type" to "SyncDocumentCommand", "content" to content, "documentRevision" to 0))

    /** Plays another tool setting the Document to [content], as the editor's `DocumentListener` reports it. */
    private fun Fixture.editExternally(content: String) {
        WriteCommandAction.runWriteCommandAction(webview.session.project) { bpmn.document.setText(content) }
        webview.router.notifyDocumentChanged(webview.session) { bpmn.document.text }
    }

    /** Skips the webview messages the router forwards to the core up to the next request reply. */
    private fun Fixture.nextReply(): JsonObject {
        while (true) {
            val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
            if (frame.has("id")) return frame
        }
    }

    @Test
    fun `a save-all writes the edit the webview has not synced yet`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)

        FileDocumentManager.getInstance().saveAllDocuments()

        assertEquals(EDITED_XML, Files.readString(f.bpmn.nioPath), "the saved file holds the webview's last edit")
        assertEquals(1, f.webview.flushQueries.size, "the save asks the webview once")
        val query = f.webview.flushQueries.single()
        assertFalse(query.get("destructive")?.asBoolean ?: false, "a save must not lock the page the way a close does")
        assertFalse(
            query.get("exportWhenEdited")?.asBoolean ?: false,
            "a save asks only for the edit the page's sync still holds",
        )
    }

    @Test
    fun `a save-all writes the webview's newest edit over an older synced one`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = SECOND_EDIT_XML)
        f.dispatchCoreWrite(EDITED_XML)

        FileDocumentManager.getInstance().saveAllDocuments()

        assertEquals(
            SECOND_EDIT_XML,
            Files.readString(f.bpmn.nioPath),
            "the earlier synced edit is not the last one the user made",
        )
    }

    @Test
    fun `the webview's late sync after a save-all leaves the Document saved`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)

        FileDocumentManager.getInstance().saveAllDocuments()
        // The page's debounced sync of the same XML still arrives after the save.
        f.dispatchCoreWrite(EDITED_XML)

        assertFalse(
            FileDocumentManager.getInstance().isDocumentUnsaved(f.bpmn.document),
            "the late sync must not leave the saved Document modified",
        )
    }

    @Test
    fun `the webview's late sync after a save-all tells the core the Document holds the saved edit`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)

        FileDocumentManager.getInstance().saveAllDocuments()
        f.dispatchCoreWrite(EDITED_XML)

        assertTrue(
            f.nextReply().getAsJsonObject("result").get("changed").asBoolean,
            "the bridge's document mirror takes content only from a write reported as changed",
        )
    }

    @Test
    fun `a save-all ignores the page's reply to a flush the core asked for`() {
        // The core numbers its flushes from 1 up; Deploy's flush may still be answered.
        val coreFlushReply = gson.toJson(linkedMapOf("type" to "DocumentFlushedCommand", "token" to 1, "status" to "clean"))
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML, messagesBeforeAnswer = listOf(coreFlushReply))

        FileDocumentManager.getInstance().saveAllDocuments()

        assertEquals(EDITED_XML, Files.readString(f.bpmn.nioPath), "only the reply to the host's own flush counts")
        assertTrue(
            f.webview.flushQueries.single().get("token").asLong < 0,
            "every page reply also reaches the core, so the host's token must be one the core never hands out",
        )
    }

    @Test
    fun `a save-all during a pending external edit keeps the host's content`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)
        // Another tool changed the file; its debounced render has not reached the page.
        f.editExternally(EXTERNAL_XML)

        FileDocumentManager.getInstance().saveAllDocuments()

        assertTrue(f.webview.flushQueries.isEmpty(), "the authoritative host edit bypasses webview export")
        assertEquals(EXTERNAL_XML, Files.readString(f.bpmn.nioPath))
    }

    @Test
    fun `a save-all writes the sync the webview sent while the host waited for its clean answer`() {
        // The page's debounce fired after the host asked, so the page has no sync left pending.
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = null, messagesBeforeAnswer = listOf(syncCommand(EDITED_XML)))

        FileDocumentManager.getInstance().saveAllDocuments()

        assertEquals(EDITED_XML, Files.readString(f.bpmn.nioPath), "the core's write of that sync lands after the save")
    }

    @Test
    fun `a second write of the saved edit reports no change`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)
        FileDocumentManager.getInstance().saveAllDocuments()
        f.dispatchCoreWrite(EDITED_XML)
        assertTrue(f.nextReply().getAsJsonObject("result").get("changed").asBoolean)

        f.dispatchCoreWrite(EDITED_XML)

        assertFalse(
            f.nextReply().getAsJsonObject("result").get("changed").asBoolean,
            "the first write already gave the core's mirror the saved edit",
        )
    }

    @Test
    fun `a write after an external edit back to the saved edit reports no change`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)
        FileDocumentManager.getInstance().saveAllDocuments()
        f.editExternally(EXTERNAL_XML)
        f.editExternally(EDITED_XML)

        f.dispatchCoreWrite(EDITED_XML, expectedDocumentRevision = 2)

        val result = f.nextReply().getAsJsonObject("result")
        assertTrue(result.get("accepted").asBoolean, "the write carries the external edit's revision")
        assertFalse(result.get("changed").asBoolean, "the external edit's didChange gives the core's mirror that content")
    }

    @Test
    fun `a save-all whose write throws after the Document took the edit still tells the late sync it changed`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)
        failNextCommandAfterItRuns(f.webview.session.project, IllegalStateException("listener failed"))

        FileDocumentManager.getInstance().saveAllDocuments()
        f.dispatchCoreWrite(EDITED_XML)

        assertEquals(EDITED_XML, Files.readString(f.bpmn.nioPath))
        assertTrue(
            f.nextReply().getAsJsonObject("result").get("changed").asBoolean,
            "the core's mirror never heard of the edit the Document took",
        )
    }

    @Test
    fun `the webview's late sync after a save-all and a re-register reports no change`() {
        val f = setUpRouter(INITIAL_XML, unsyncedWebviewXml = EDITED_XML)
        FileDocumentManager.getInstance().saveAllDocuments()

        f.webview.router.reregisterLiveSessions()
        f.dispatchCoreWrite(EDITED_XML)

        assertFalse(
            f.nextReply().getAsJsonObject("result").get("changed").asBoolean,
            "the re-register already seeded the core's mirror with the saved edit",
        )
    }

    private companion object {
        const val INITIAL_XML = "<bpmn:definitions id=\"a\"/>\n"
        const val EDITED_XML = "<bpmn:definitions id=\"b\"/>\n"
        const val SECOND_EDIT_XML = "<bpmn:definitions id=\"c\"/>\n"
        const val EXTERNAL_XML = "<bpmn:definitions id=\"external\"/>\n"
    }
}
