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
        PluginApprovalStore.getInstance().replaceAll(emptyList())
    }

    @AfterEach
    fun tearDown() {
        wired?.dispose()
        PluginApprovalStore.getInstance().replaceAll(storedBefore)
    }

    /** A router whose push to every running bridge reaches this one's channel, as for the changing bridge itself. */
    private fun routedBridge(): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        lateinit var router: PluginApprovalRouter
        router =
            PluginApprovalRouter(
                bridgeDeps(projectFixture.get(), wired.channel, wired.handlers),
                pushToRunningBridges = { router.push(it) },
            )
        router.register()
        return wired
    }

    private fun parse(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    private fun row(pluginId: String, hash: String = HASH) = """{"pluginId": "$pluginId", "contentHash": "$hash"}"""

    private fun WiredBridge.change(requestId: Int, allow: List<String> = emptyList(), revoke: List<String> = emptyList()) =
        handlers.dispatch(
            "pluginApprovals/change",
            parse("""{"allow": [${allow.joinToString()}], "revoke": [${revoke.joinToString { "\"$it\"" }}]}"""),
            requestId(requestId),
        )

    @Test
    fun `a change stores the merged list and pushes it to the bridges before it answers with it, both at its revision`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(OLD_ID, HASH)))
        val before = PluginApprovalStore.getInstance().snapshot().revision

        wired.change(5, allow = listOf(row(PLUGIN_ID)))

        val stored = listOf(PluginApproval(OLD_ID, HASH), PluginApproval(PLUGIN_ID, HASH))
        assertEquals(stored, PluginApprovalStore.getInstance().read())
        val revision = PluginApprovalStore.getInstance().snapshot().revision
        assertTrue(revision > before, "revision $revision after $before")
        val expected = parse("""{"approvals": [${row(OLD_ID)}, ${row(PLUGIN_ID)}], "revision": $revision}""")
        val pushed = parse(wired.fake.nextFrame())
        assertEquals("pluginApprovals/didChange", pushed.get("method").asString)
        assertEquals(expected, pushed.getAsJsonObject("params"))
        val answer = parse(wired.fake.nextFrame())
        assertEquals(5, answer.get("id").asInt)
        assertFalse(answer.has("error"))
        assertEquals(expected, answer.getAsJsonObject("result"))
    }

    @Test
    fun `two projects' answers built from the same old list keep both rows`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(OLD_ID, HASH)))

        wired.change(7, allow = listOf(row(PLUGIN_ID)))
        wired.change(8, allow = listOf(row(OTHER_ID)))

        assertEquals(
            listOf(PluginApproval(OLD_ID, HASH), PluginApproval(PLUGIN_ID, HASH), PluginApproval(OTHER_ID, HASH)),
            PluginApprovalStore.getInstance().read(),
        )
    }

    @Test
    fun `a later allow of another plugin does not bring back a revoked one`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(OLD_ID, HASH), PluginApproval(PLUGIN_ID, HASH)))

        wired.change(9, revoke = listOf(OLD_ID))
        wired.change(10, allow = listOf(row(OTHER_ID)))

        assertEquals(
            listOf(PluginApproval(PLUGIN_ID, HASH), PluginApproval(OTHER_ID, HASH)),
            PluginApprovalStore.getInstance().read(),
        )
    }

    @Test
    fun `a change that keeps every row bumps no revision, pushes nothing and still answers with the list`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(PLUGIN_ID, HASH)))
        val revision = PluginApprovalStore.getInstance().snapshot().revision

        wired.change(11, allow = listOf(row(PLUGIN_ID)), revoke = listOf(OTHER_ID))

        val answer = parse(wired.fake.nextFrame())
        assertEquals(11, answer.get("id").asInt)
        assertEquals(parse("""{"approvals": [${row(PLUGIN_ID)}], "revision": $revision}"""), answer.getAsJsonObject("result"))
        assertEquals(revision, PluginApprovalStore.getInstance().snapshot().revision)
    }

    @Test
    fun `a read answers the stored list with its revision`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(PLUGIN_ID, HASH)))
        val revision = PluginApprovalStore.getInstance().snapshot().revision

        wired.handlers.dispatch("pluginApprovals/read", parse("{}"), wired.requestId(13))

        val answer = parse(wired.fake.nextFrame())
        assertEquals(13, answer.get("id").asInt)
        assertEquals(parse("""{"approvals": [${row(PLUGIN_ID)}], "revision": $revision}"""), answer.getAsJsonObject("result"))
    }

    @Test
    fun `a change with a row that is no approval answers an error and stores nothing`() {
        val wired = routedBridge()

        wired.fake.emit(
            """{"id": 6, "method": "pluginApprovals/change", "params": {"allow": [{"pluginId": "$PLUGIN_ID"}], "revoke": []}}""",
        )

        val reply = parse(wired.fake.nextFrame())
        assertEquals(6, reply.get("id").asInt)
        assertTrue(reply.has("error"), reply.toString())
        assertEquals(emptyList<PluginApproval>(), PluginApprovalStore.getInstance().read())
    }

    @Test
    fun `a change that both allows and revokes one id answers an error and stores nothing`() {
        val wired = routedBridge()
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(OLD_ID, HASH)))

        wired.fake.emit(
            """{"id": 12, "method": "pluginApprovals/change", "params": {"allow": [${row(PLUGIN_ID)}], "revoke": ["$PLUGIN_ID"]}}""",
        )

        val reply = parse(wired.fake.nextFrame())
        assertEquals(12, reply.get("id").asInt)
        assertTrue(reply.get("error").asString.contains("names an id twice"), reply.toString())
        assertEquals(listOf(PluginApproval(OLD_ID, HASH)), PluginApprovalStore.getInstance().read())
    }

    private companion object {
        const val PLUGIN_ID = "/ws/.camunda/plugins/resize-tasks"
        const val OTHER_ID = "/other/.camunda/plugins/reduced-palette"
        const val OLD_ID = "/ws/.camunda/plugins/colors"
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
}
