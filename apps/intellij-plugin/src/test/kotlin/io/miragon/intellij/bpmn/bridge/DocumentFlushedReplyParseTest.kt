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
            """{"type":"DocumentFlushedCommand","token":7,"content":"<xml/>"}""",
            gson,
        )
        assertEquals(7L, reply?.token)
        assertEquals("<xml/>", reply?.content)
    }

    @Test
    fun `null content is preserved as nothing-to-flush`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":3}""",
            gson,
        )
        assertEquals(3L, reply?.token)
        assertNull(reply?.content)
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
