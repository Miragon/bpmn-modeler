package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Pure-parse coverage for the page-flush reply that a save, a close and a
 * respawn act on: turning the webview's raw JSON into a token+content pair,
 * and rejecting everything else. `EditorSessionRouterTest` covers the round
 * trip around it.
 */
class DocumentFlushedReplyParseTest {
    private val gson = Gson()

    @Test
    fun `parses token and content`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":7,"content":"<xml/>","documentRevision":4}""",
            gson,
        )
        assertEquals(7L, reply?.token)
        assertEquals("<xml/>", reply?.content)
        assertEquals("flushed", reply?.status)
        assertEquals(4L, reply?.documentRevision)
    }

    @Test
    fun `null content is preserved as nothing-to-flush`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":3}""",
            gson,
        )
        assertEquals(3L, reply?.token)
        assertNull(reply?.content)
        assertEquals("clean", reply?.status)
    }

    @Test
    fun `explicit json null content parses to null`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":3,"content":null}""",
            gson,
        )
        assertEquals(3L, reply?.token)
        assertNull(reply?.content)
    }

    @Test
    fun `parses explicit unavailable status`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":4,"status":"unavailable"}""",
            gson,
        )
        assertEquals(4L, reply?.token)
        assertEquals("unavailable", reply?.status)
        assertNull(reply?.content)
    }

    @Test
    fun `parses sync content for the flush fallback`() {
        assertEquals(
            "<latest/>",
            parseSyncDocumentContent(
                """{"type":"SyncDocumentCommand","content":"<latest/>"}""",
                gson,
            ),
        )
    }

    @Test
    fun `parses sync revision for the flush fallback`() {
        val reply =
            parseSyncDocumentReply(
                """{"type":"SyncDocumentCommand","content":"<latest/>","documentRevision":6}""",
                gson,
            )

        assertEquals("<latest/>", reply?.content)
        assertEquals(6L, reply?.documentRevision)
    }

    @Test
    fun `flushed content must represent the current host revision`() {
        assertEquals(true, pageFlushRevisionMatches(2, 2))
        assertEquals(false, pageFlushRevisionMatches(2, 1))
        assertEquals(false, pageFlushRevisionMatches(2, null))
        assertEquals(true, pageFlushRevisionMatches(0, null))
    }

    @Test
    fun `unavailable reply preserves captured sync fallback`() {
        val reply = DocumentFlushedReply(4L, null, "unavailable")

        assertEquals("<latest/>", pageFlushContent("<latest/>", reply, cleanReplyKeepsCapturedSync = false))
    }

    @Test
    fun `flushed reply replaces captured sync fallback`() {
        val reply = DocumentFlushedReply(4L, "<exported/>", "flushed")

        assertEquals("<exported/>", pageFlushContent("<latest/>", reply, cleanReplyKeepsCapturedSync = true))
    }

    @Test
    fun `a destructive flush's clean reply discards an older captured sync`() {
        val reply = DocumentFlushedReply(4L, null, "clean")

        assertNull(pageFlushContent("<stale/>", reply, cleanReplyKeepsCapturedSync = false))
    }

    @Test
    fun `a save flush's clean reply keeps the sync the page sent during the wait`() {
        val reply = DocumentFlushedReply(4L, null, "clean")

        assertEquals("<latest/>", pageFlushContent("<latest/>", reply, cleanReplyKeepsCapturedSync = true))
    }

    @Test
    fun `host update reply discards an older captured sync`() {
        val reply = DocumentFlushedReply(4L, null, "host-updated")

        assertNull(pageFlushContent("<stale/>", reply, cleanReplyKeepsCapturedSync = true))
    }

    @Test
    fun `other message types are rejected`() {
        assertNull(
            parseDocumentFlushedReply("""{"type":"SyncDocumentCommand","content":"<xml/>"}""", gson),
        )
    }

    @Test
    fun `missing token is rejected`() {
        assertNull(parseDocumentFlushedReply("""{"type":"DocumentFlushedCommand"}""", gson))
    }

    @Test
    fun `malformed json is rejected`() {
        assertNull(parseDocumentFlushedReply("not json", gson))
    }

    @Test
    fun `readTopLevelLong reads a member that follows a large string`() {
        val content = "<bpmn:task/>".repeat(10_000)
        val raw = """{"type":"SyncDocumentCommand","content":"$content","documentRevision":12}"""
        assertEquals(12L, readTopLevelLong(raw, "documentRevision", gson))
    }

    @Test
    fun `readTopLevelLong ignores nested members of the same name`() {
        val raw = """{"meta":{"documentRevision":5},"list":[1,{"documentRevision":6}],"documentRevision":7}"""
        assertEquals(7L, readTopLevelLong(raw, "documentRevision", gson))
    }

    @Test
    fun `readTopLevelLong returns null for absent, null, non-numeric or malformed input`() {
        assertNull(readTopLevelLong("""{"type":"SyncDocumentCommand"}""", "documentRevision", gson))
        assertNull(readTopLevelLong("""{"documentRevision":null}""", "documentRevision", gson))
        assertNull(readTopLevelLong("""{"documentRevision":"3"}""", "documentRevision", gson))
        assertNull(readTopLevelLong("""{"documentRevision":""", "documentRevision", gson))
        assertNull(readTopLevelLong("[1,2]", "documentRevision", gson))
    }
}
