package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Pure-parse coverage for the close-flush reply. The latch/EDT flow around it is
 * verified manually (it needs a live JCEF browser), so this pins the one piece
 * that can be tested in isolation: turning the webview's raw JSON into a
 * token+content pair the close hook can act on, and rejecting everything else.
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
    fun `parses sync content for the close fallback`() {
        assertEquals(
            "<latest/>",
            parseSyncDocumentContent(
                """{"type":"SyncDocumentCommand","content":"<latest/>"}""",
                gson,
            ),
        )
    }

    @Test
    fun `parses sync revision for the close fallback`() {
        val reply =
            parseSyncDocumentReply(
                """{"type":"SyncDocumentCommand","content":"<latest/>","documentRevision":6}""",
                gson,
            )

        assertEquals("<latest/>", reply?.content)
        assertEquals(6L, reply?.documentRevision)
    }

    @Test
    fun `close content must represent the current host revision`() {
        assertEquals(true, closeFlushRevisionMatches(2, 2))
        assertEquals(false, closeFlushRevisionMatches(2, 1))
        assertEquals(false, closeFlushRevisionMatches(2, null))
        assertEquals(true, closeFlushRevisionMatches(0, null))
    }

    @Test
    fun `unavailable reply preserves captured sync fallback`() {
        val reply = DocumentFlushedReply(4L, null, "unavailable")

        assertEquals("<latest/>", closeFlushContent("<latest/>", reply))
    }

    @Test
    fun `flushed reply replaces captured sync fallback`() {
        val reply = DocumentFlushedReply(4L, "<exported/>", "flushed")

        assertEquals("<exported/>", closeFlushContent("<latest/>", reply))
    }

    @Test
    fun `clean reply discards an older captured sync`() {
        val reply = DocumentFlushedReply(4L, null, "clean")

        assertNull(closeFlushContent("<stale/>", reply))
    }

    @Test
    fun `host update reply discards an older captured sync`() {
        val reply = DocumentFlushedReply(4L, null, "host-updated")

        assertNull(closeFlushContent("<stale/>", reply))
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
}
