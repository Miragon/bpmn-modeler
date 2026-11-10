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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

@TestApplication
class TemplatePreferenceStoreTest {
    private val properties get() = PropertiesComponent.getInstance()

    private val store get() = TemplatePreferenceStore.getInstance()

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
    fun `merges a change as the core's templatePreferencesAfter does`(case: MergeCase) {
        store.replaceAll(case.stored)

        val outcome = store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, case.disable, case.enable))

        assertEquals(case.result, outcome.snapshot.disabled)
        assertEquals(case.result, store.snapshot().disabled)
    }

    @ParameterizedTest
    @MethodSource("rejected")
    fun `rejects a change that names a switch twice, as the core's templatePreferenceChange does`(case: RejectedCase) {
        assertThrows(IllegalArgumentException::class.java) {
            TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, case.disable, case.enable)
        }
    }

    @Test
    fun `reports a change that keeps every switch as unchanged and writes nothing`() {
        properties.setValue(KEY, """[{"source": "$SHOP"}, {"templateId": "mail"}]""")

        val outcome = store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, listOf(TemplateSwitch(SHOP)), emptyList()))

        assertFalse(outcome.changed)
        assertEquals(listOf(TemplateSwitch(SHOP)), outcome.snapshot.disabled)
        assertTrue(properties.getValue(KEY)!!.contains("mail"))
    }

    @Test
    fun `grows the revision with every write and keeps it for a change that keeps every switch`() {
        val first = store.snapshot().revision

        val disabled = store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, listOf(TemplateSwitch(SHOP)), emptyList()))
        val kept = store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, listOf(TemplateSwitch(SHOP)), emptyList()))
        val enabled = store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, emptyList(), listOf(TemplateSwitch(SHOP))))

        assertTrue(disabled.snapshot.revision > first)
        assertEquals(disabled.snapshot.revision, kept.snapshot.revision)
        assertTrue(enabled.snapshot.revision > kept.snapshot.revision)
        assertEquals(enabled.snapshot, store.snapshot())
    }

    @Test
    fun `keeps every switch of changes made at once from many threads`() {
        val switches = (1..32).map { TemplateSwitch(SHOP, "template-$it") }
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(8)
        try {
            switches.forEach { switch ->
                pool.execute {
                    start.await()
                    store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, listOf(switch), emptyList()))
                }
            }
            start.countDown()
        } finally {
            pool.shutdown()
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
        }

        assertEquals(switches.toSet(), store.snapshot().disabled.toSet())
    }

    @Test
    fun `keeps the switches as one application value with the wire keys and no key for a whole source`() {
        store.replaceAll(listOf(TemplateSwitch(SHOP), TemplateSwitch(SHOP, "mail")))

        assertEquals(
            JsonParser.parseString("""[{"source": "$SHOP"}, {"source": "$SHOP", "templateId": "mail"}]"""),
            JsonParser.parseString(properties.getValue(KEY)),
        )
    }

    @Test
    fun `reads no switch before any was written`() {
        assertEquals(emptyList<TemplateSwitch>(), store.snapshot().disabled)
    }

    @Test
    fun `reads a corrupt stored value as no switch`() {
        properties.setValue(KEY, "{not json")

        assertEquals(emptyList<TemplateSwitch>(), store.snapshot().disabled)
    }

    @Test
    fun `drops the stored rows that are no switch`() {
        properties.setValue(
            KEY,
            """[{"source": "$SHOP"}, {"templateId": "mail"}, "row", {"source": 1}, {"source": "$SHOP", "templateId": 2}, {"source": "$SHOP", "templateId": null}]""",
        )

        assertEquals(listOf(TemplateSwitch(SHOP)), store.snapshot().disabled)
    }

    @Test
    fun `reads a switch from the wire as the core writes it, and nothing else`() {
        assertEquals(TemplateSwitch(SHOP, "mail"), TemplateSwitch.fromJson(JsonParser.parseString("""{"source": "$SHOP", "templateId": "mail"}""")))
        assertEquals(TemplateSwitch(SHOP), TemplateSwitch.fromJson(JsonParser.parseString("""{"source": "$SHOP"}""")))
        assertNull(TemplateSwitch.fromJson(JsonParser.parseString("""{"source": "$SHOP", "templateId": null}""")))
        assertNull(TemplateSwitch.fromJson(JsonParser.parseString("""["$SHOP"]""")))
    }

    class MergeCase(
        val stored: List<TemplateSwitch>,
        val disable: List<TemplateSwitch>,
        val enable: List<TemplateSwitch>,
        val result: List<TemplateSwitch>,
    )

    class RejectedCase(val disable: List<TemplateSwitch>, val enable: List<TemplateSwitch>)

    companion object {
        private fun cases(): JsonObject = readTypeScriptJson("miragon.templatePreferenceChangeCases").asJsonObject

        // A case row is [source] for a whole source or [source, templateId] for one template in it.
        private fun switches(rows: JsonArray): List<TemplateSwitch> =
            rows.map { row -> row.asJsonArray.let { TemplateSwitch(it[0].asString, it.takeIf { it.size() > 1 }?.get(1)?.asString) } }

        @JvmStatic
        fun merges(): List<Named<MergeCase>> =
            cases().getAsJsonArray("merges").map { it.asJsonObject }.map { case ->
                Named.of(
                    case.get("name").asString,
                    MergeCase(
                        switches(case.getAsJsonArray("stored")),
                        switches(case.getAsJsonArray("disable")),
                        switches(case.getAsJsonArray("enable")),
                        switches(case.getAsJsonArray("result")),
                    ),
                )
            }

        @JvmStatic
        fun rejected(): List<Named<RejectedCase>> =
            cases().getAsJsonArray("rejected").map { it.asJsonObject }.map { case ->
                Named.of(
                    case.get("name").asString,
                    RejectedCase(switches(case.getAsJsonArray("disable")), switches(case.getAsJsonArray("enable"))),
                )
            }

        private const val KEY = "miragon.bpmnModeler.templatePreferences"
        private const val SHOP = "configFolder:shop/.camunda"
    }
}
