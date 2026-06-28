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
        val router = EditorSessionRouter(bridgeDeps(project, wired.channel, wired.handlers))
        router.register()

        val session = CoreSession(bpmn.file.url, bpmn.file, project) {}
        router.registerSession(session)
        assertEquals(
            "session/register",
            parse(wired.fake.nextFrame()).get("method").asString,
            "registerSession seeds the core before any document traffic",
        )
        return Fixture(router, session, bpmn, wired).also { fixture = it }
    }

    private class Fixture(
        val router: EditorSessionRouter,
        val session: CoreSession,
        val bpmn: BpmnTestFile,
        val wired: WiredBridge,
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

        val didChange = parse(f.wired.fake.nextFrame())
        assertEquals("document/didChange", didChange.get("method").asString)
        assertFalse(
            didChange.getAsJsonObject("params").has("causedBy"),
            "an edit the host did not originate carries no causation token",
        )
    }

    private companion object {
        const val REVISION = 7L
        const val INITIAL_XML = "<bpmn:definitions id=\"a\"/>\n"
        const val EDITED_XML = "<bpmn:definitions id=\"b\"/>\n"
    }
}
