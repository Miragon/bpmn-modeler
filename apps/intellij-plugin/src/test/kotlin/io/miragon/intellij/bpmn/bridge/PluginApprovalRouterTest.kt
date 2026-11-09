package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class PluginApprovalRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private var wired: WiredBridge? = null

    private lateinit var storedBefore: List<PluginApproval>

    @BeforeEach
    fun rememberApprovals() {
        storedBefore = PluginApprovalStore.getInstance().read()
        PluginApprovalStore.getInstance().write(emptyList())
    }

    @AfterEach
    fun tearDown() {
        wired?.dispose()
        PluginApprovalStore.getInstance().write(storedBefore)
    }

    /** A router whose push to every running bridge reaches this one's channel, as for the saving bridge itself. */
    private fun routedBridge(): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        lateinit var router: PluginApprovalRouter
        router =
            PluginApprovalRouter(
                bridgeDeps(projectFixture.get(), wired.channel, wired.handlers),
                pushToRunningBridges = { router.push() },
            )
        router.register()
        return wired
    }

    private fun parse(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    @Test
    fun `a save stores the approvals and pushes them to the bridges before it acks`() {
        val wired = routedBridge()

        wired.handlers.dispatch(
            "pluginApprovals/save",
            parse("""{"approvals": [{"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}]}"""),
            wired.requestId(5),
        )

        assertEquals(listOf(PluginApproval(PLUGIN_ID, HASH)), PluginApprovalStore.getInstance().read())
        val pushed = parse(wired.fake.nextFrame())
        assertEquals("pluginApprovals/didChange", pushed.get("method").asString)
        assertEquals(
            parse("""{"approvals": [{"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}]}"""),
            pushed.getAsJsonObject("params"),
        )
        val ack = parse(wired.fake.nextFrame())
        assertEquals(5, ack.get("id").asInt)
        assertFalse(ack.has("error"))
    }

    @Test
    fun `two projects' answers built from the same old list keep both rows`() {
        val wired = routedBridge()
        val old = """{"pluginId": "$OLD_ID", "contentHash": "$HASH"}"""
        PluginApprovalStore.getInstance().write(listOf(PluginApproval(OLD_ID, HASH)))

        wired.handlers.dispatch(
            "pluginApprovals/save",
            parse("""{"approvals": [$old, {"pluginId": "$PLUGIN_ID", "contentHash": "$HASH"}]}"""),
            wired.requestId(7),
        )
        wired.handlers.dispatch(
            "pluginApprovals/save",
            parse("""{"approvals": [$old, {"pluginId": "$OTHER_ID", "contentHash": "$HASH"}]}"""),
            wired.requestId(8),
        )

        assertEquals(
            listOf(PluginApproval(OLD_ID, HASH), PluginApproval(PLUGIN_ID, HASH), PluginApproval(OTHER_ID, HASH)),
            PluginApprovalStore.getInstance().read(),
        )
    }

    @Test
    fun `a save with a row that is no approval answers an error and stores nothing`() {
        val wired = routedBridge()

        wired.fake.emit(
            """{"id": 6, "method": "pluginApprovals/save", "params": {"approvals": [{"pluginId": "$PLUGIN_ID"}]}}""",
        )

        val reply = parse(wired.fake.nextFrame())
        assertEquals(6, reply.get("id").asInt)
        assertTrue(reply.has("error"), reply.toString())
        assertEquals(emptyList<PluginApproval>(), PluginApprovalStore.getInstance().read())
    }

    private companion object {
        const val PLUGIN_ID = "/ws/.camunda/plugins/resize-tasks"
        const val OTHER_ID = "/other/.camunda/plugins/reduced-palette"
        const val OLD_ID = "/ws/.camunda/plugins/colors"
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
}
