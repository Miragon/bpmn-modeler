package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import io.miragon.intellij.bpmn.readTypeScriptJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

/**
 * Runs `documentFlushReply.cases.json`, which `libs/shared` runs against its
 * flush reply table, plus the page-flush parsing only the IntelliJ host does.
 * `EditorSessionRouterTest` covers the round trip around it.
 */
class DocumentFlushedReplyParseTest {
    private val gson = Gson()

    @ParameterizedTest
    @MethodSource("parseCases")
    fun `reads a reply like the TypeScript table`(case: JsonObject) {
        val message = case.getAsJsonObject("message").deepCopy()
        message.addProperty("type", "DocumentFlushedCommand")
        message.addProperty("token", 7)

        val parsed = parseDocumentFlushedReply(message.toString(), gson)

        assertEquals(case.get("reply").toFlushReply(), parsed?.reply)
        parsed?.let { assertEquals(7L, it.token) }
    }

    @ParameterizedTest
    @MethodSource("decideCases")
    fun `decides the write like the TypeScript table`(case: JsonObject) {
        val decision =
            decideFlushWrite(
                case.get("reply").toFlushReply()!!,
                case.get("observedSync").toObservedPageSync(),
                case.get("destructive").asBoolean,
            )

        assertEquals(case.getAsJsonObject("decision").toFlushWriteDecision(), decision)
    }

    @Test
    fun `every status of the TypeScript table has a Kotlin twin`() {
        val statuses =
            parseCases().mapNotNull { case ->
                case.payload.get("reply").takeIf { it.isJsonObject }?.asJsonObject?.get("status")?.asString
            }

        assertEquals(FlushReplyStatus.entries.map { it.wire }.toSet(), statuses.toSet())
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

    companion object {
        private val cases by lazy { readTypeScriptJson("miragon.documentFlushReplyCases").asJsonObject }

        @JvmStatic
        fun parseCases(): List<Named<JsonObject>> = rows("parse")

        @JvmStatic
        fun decideCases(): List<Named<JsonObject>> = rows("decide")

        private fun rows(table: String): List<Named<JsonObject>> =
            cases.getAsJsonArray(table).map { row ->
                val case = row.asJsonObject
                Named.of(case.get("case").asString, case)
            }

        private fun JsonElement.toFlushReply(): FlushReply? =
            takeIf { !it.isJsonNull }?.asJsonObject?.let { reply ->
                FlushReply(
                    FlushReplyStatus.of(reply.get("status").asString),
                    reply.get("content")?.asString,
                    reply.get("documentRevision")?.asLong,
                )
            }

        private fun JsonElement.toObservedPageSync(): ObservedPageSync? =
            takeIf { !it.isJsonNull }?.asJsonObject?.let { sync ->
                if (sync.get("status").asString == "failed") {
                    ObservedPageSync.Failed
                } else {
                    ObservedPageSync.Synced(sync.get("content").asString, sync.get("documentRevision").asLong)
                }
            }

        private fun JsonObject.toFlushWriteDecision(): FlushWriteDecision =
            when (val kind = get("kind").asString) {
                "writeExport" -> FlushWriteDecision.WriteExport(get("content").asString, get("documentRevision")?.asLong)
                "writeObservedSync" ->
                    FlushWriteDecision.WriteObservedSync(get("content").asString, get("documentRevision").asLong)
                "awaitSentSyncs" -> FlushWriteDecision.AwaitSentSyncs
                "keepHostDocument" -> FlushWriteDecision.KeepHostDocument
                "syncFailed" -> FlushWriteDecision.SyncFailed
                "unavailable" -> FlushWriteDecision.Unavailable
                else -> error("Unknown flush write decision $kind")
            }
    }
}
