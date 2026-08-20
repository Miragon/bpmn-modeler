package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

/**
 * Pure-parse coverage for the close-flush reply. The latch/EDT flow around it is
 * verified manually (it needs a live JCEF browser), so this pins the one piece
 * that can be tested in isolation: turning the webview's raw JSON into a
 * token+content pair the close hook can act on, and rejecting everything else.
 */
class DocumentFlushedReplyParseTest {
    private val gson = Gson()
    private val flushedCommandFixture = Files.readString(
        Path.of(
            System.getProperty("user.dir"),
            "..",
            "..",
            "libs",
            "shared",
            "test-fixtures",
            "document-flushed-command.json",
        ).normalize(),
    ).trim()

    @Test
    fun `parses flushed result content`() {
        val reply = parseDocumentFlushedReply(
            flushedCommandFixture,
            gson,
        )
        assertEquals(3L, reply?.token)
        assertEquals("<xml/>", reply?.content)
    }

    @Test
    fun `idle result is preserved as nothing-to-flush`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":3,"result":{"status":"idle"}}""",
            gson,
        )
        assertEquals(3L, reply?.token)
        assertNull(reply?.content)
    }

    @Test
    fun `failed result is preserved without content`() {
        val reply = parseDocumentFlushedReply(
            """{"type":"DocumentFlushedCommand","token":3,"result":{"status":"failed"}}""",
            gson,
        )
        assertEquals(3L, reply?.token)
        assertNull(reply?.content)
    }

    @Test
    fun `flushed result without content is rejected`() {
        assertNull(
            parseDocumentFlushedReply(
                """{"type":"DocumentFlushedCommand","token":3,"result":{"status":"flushed"}}""",
                gson,
            ),
        )
    }

    @Test
    fun `unknown result status is rejected`() {
        assertNull(
            parseDocumentFlushedReply(
                """{"type":"DocumentFlushedCommand","token":3,"result":{"status":"unknown"}}""",
                gson,
            ),
        )
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
