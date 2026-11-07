package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

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

    @Test
    fun `reads back the approvals it wrote`() {
        val approvals = listOf(PluginApproval(PLUGIN_ID, HASH), PluginApproval("/ws/.camunda/plugins/colors", OTHER_HASH))

        PluginApprovalStore.getInstance().write(approvals)

        assertEquals(approvals, PluginApprovalStore.getInstance().read())
    }

    @Test
    fun `keeps the approvals as one application value with the wire keys`() {
        PluginApprovalStore.getInstance().write(listOf(PluginApproval(PLUGIN_ID, HASH)))

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

    private companion object {
        const val KEY = "miragon.bpmnModeler.pluginApprovals"
        const val PLUGIN_ID = "/ws/.camunda/plugins/resize-tasks"
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        const val OTHER_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    }
}
