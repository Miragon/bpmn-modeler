package io.miragon.intellij.bpmn

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

@TestApplication
class PluginApprovalStoreTest {
    private val properties get() = PropertiesComponent.getInstance()

    private var storedBefore: String? = null

    @BeforeEach
    fun rememberStoredValue() {
        storedBefore = properties.getValue(KEY)
        properties.unsetValue(KEY)
    }

    @AfterEach
    fun restoreStoredValue() {
        properties.setValue(KEY, storedBefore)
    }

    @ParameterizedTest
    @MethodSource("merges")
    fun `merges a change as the core's approvalsAfter does`(case: MergeCase) {
        PluginApprovalStore.getInstance().replaceAll(case.stored)

        val outcome = PluginApprovalStore.getInstance().change(PluginApprovalChange(case.allow, case.revoke))

        assertEquals(case.result, outcome.snapshot.approvals)
        assertEquals(case.result, PluginApprovalStore.getInstance().read())
    }

    @ParameterizedTest
    @MethodSource("rejected")
    fun `rejects a change that names an id twice, as the core's codeApprovalChange does`(case: RejectedCase) {
        assertThrows(IllegalArgumentException::class.java) { PluginApprovalChange(case.allow, case.revoke) }
    }

    @Test
    fun `reads back the approvals a change allowed`() {
        val approvals = listOf(PluginApproval(PLUGIN_ID, HASH), PluginApproval("/ws/.camunda/plugins/colors", OTHER_HASH))

        PluginApprovalStore.getInstance().change(PluginApprovalChange(approvals, emptyList()))

        assertEquals(approvals, PluginApprovalStore.getInstance().read())
    }

    @Test
    fun `reports a change that keeps every row as unchanged and writes nothing`() {
        properties.setValue(KEY, """[{"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}, {"pluginId": "/only-id"}]""")

        val outcome = PluginApprovalStore.getInstance().change(PluginApprovalChange(listOf(PluginApproval(PLUGIN_ID, HASH)), emptyList()))

        assertFalse(outcome.changed)
        assertEquals(listOf(PluginApproval(PLUGIN_ID, HASH)), outcome.snapshot.approvals)
        assertTrue(properties.getValue(KEY)!!.contains("/only-id"))
    }

    @Test
    fun `grows the revision with every write and keeps it for a change that keeps every row`() {
        val store = PluginApprovalStore.getInstance()
        val first = store.snapshot().revision

        val allowed = store.change(PluginApprovalChange(listOf(PluginApproval(PLUGIN_ID, HASH)), emptyList()))
        val kept = store.change(PluginApprovalChange(listOf(PluginApproval(PLUGIN_ID, HASH)), emptyList()))
        val revoked = store.change(PluginApprovalChange(emptyList(), listOf(PLUGIN_ID)))

        assertTrue(allowed.snapshot.revision > first)
        assertEquals(allowed.snapshot.revision, kept.snapshot.revision)
        assertTrue(revoked.snapshot.revision > kept.snapshot.revision)
        assertEquals(revoked.snapshot, store.snapshot())
    }

    @Test
    fun `keeps every row of changes made at once from many threads`() {
        val ids = (1..32).map { "/ws/.camunda/plugins/p$it" }
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(8)
        try {
            ids.forEach { id ->
                pool.execute {
                    start.await()
                    PluginApprovalStore.getInstance().change(PluginApprovalChange(listOf(PluginApproval(id, HASH)), emptyList()))
                }
            }
            start.countDown()
        } finally {
            pool.shutdown()
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
        }

        assertEquals(ids.toSet(), PluginApprovalStore.getInstance().read().map { it.pluginId }.toSet())
    }

    @Test
    fun `keeps the approvals as one application value with the wire keys`() {
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(PLUGIN_ID, HASH)))

        assertEquals(
            JsonParser.parseString("""[{"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}]"""),
            JsonParser.parseString(properties.getValue(KEY)),
        )
    }

    @Test
    fun `reads no approvals before any was written`() {
        assertEquals(emptyList<PluginApproval>(), PluginApprovalStore.getInstance().read())
    }

    @Test
    fun `reads a corrupt stored value as no approvals`() {
        properties.setValue(KEY, "{not json")

        assertEquals(emptyList<PluginApproval>(), PluginApprovalStore.getInstance().read())
    }

    @Test
    fun `drops the stored rows that are no approval`() {
        properties.setValue(
            KEY,
            """[{"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}, {"pluginId": "/only-id"}, "row", {"pluginId": 1, "contentHash": 2}]""",
        )

        assertEquals(listOf(PluginApproval(PLUGIN_ID, HASH)), PluginApprovalStore.getInstance().read())
    }

    class MergeCase(
        val stored: List<PluginApproval>,
        val allow: List<PluginApproval>,
        val revoke: List<String>,
        val result: List<PluginApproval>,
    )

    class RejectedCase(val allow: List<PluginApproval>, val revoke: List<String>)

    companion object {
        private fun cases(): JsonObject = readTypeScriptJson("miragon.codeApprovalChangeCases").asJsonObject

        private fun rows(rows: JsonArray): List<PluginApproval> =
            rows.map { row -> row.asJsonArray.let { PluginApproval(it[0].asString, it[1].asString) } }

        private fun ids(ids: JsonArray): List<String> = ids.map { it.asString }

        @JvmStatic
        fun merges(): List<Named<MergeCase>> =
            cases().getAsJsonArray("merges").map { it.asJsonObject }.map { case ->
                Named.of(
                    case.get("name").asString,
                    MergeCase(
                        rows(case.getAsJsonArray("stored")),
                        rows(case.getAsJsonArray("allow")),
                        ids(case.getAsJsonArray("revoke")),
                        rows(case.getAsJsonArray("result")),
                    ),
                )
            }

        @JvmStatic
        fun rejected(): List<Named<RejectedCase>> =
            cases().getAsJsonArray("rejected").map { it.asJsonObject }.map { case ->
                Named.of(case.get("name").asString, RejectedCase(rows(case.getAsJsonArray("allow")), ids(case.getAsJsonArray("revoke"))))
            }

        private const val KEY = "miragon.bpmnModeler.pluginApprovals"
        private const val PLUGIN_ID = "/ws/.camunda/plugins/resize-tasks"
        private const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        private const val OTHER_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    }
}
