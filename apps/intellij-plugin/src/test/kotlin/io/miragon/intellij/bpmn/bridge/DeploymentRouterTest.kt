package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.IntellijDeploymentState
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/**
 * Covers that `deploymentState/save` is an *acknowledged* request, not a
 * fire-and-forget notification: it must persist the patch through
 * [IntellijDeploymentState] (so a re-seed reflects it across an IDE restart)
 * **and** answer the request id, so a failed persist surfaces as a rejected
 * promise on the core instead of being silently dropped.
 *
 * Uses a real project (`projectFixture`) so the project-scoped `PropertiesComponent`
 * the state writes through is the genuine one — the persistence path is the behaviour
 * under test, not a mock of it.
 */
@TestApplication
class DeploymentRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    private fun revision(fingerprint: String): Map<String, String> =
        mapOf("fingerprint" to fingerprint, "deployedAt" to "2026-09-17T14:32:00.000Z")

    @Test
    fun `seeds only what the project stores, leaving the defaults to the core`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()
        val state = IntellijDeploymentState.getInstance(project)

        assertEquals(emptyMap<String, Any>(), state.snapshotMap())

        save(wired, mapOf("endpoint" to "https://engine", "activeTargetName" to ""), id = 40)

        assertEquals(mapOf("endpoint" to "https://engine", "activeTargetName" to ""), state.snapshotMap())
    }

    @Test
    fun `save persists every patched field and replies to the request id`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()

        save(
            wired,
            mapOf(
                "endpoint" to "https://engine",
                "tenantId" to "t1",
                "authType" to "oauth2",
                "tokenEndpoint" to "https://token",
                "audience" to "zeebe",
                "activeTargetName" to "dev",
            ),
            id = 42,
        )

        // The persist must have run before the ack, so the stored state reflects
        // every saved field — the same values the bridge is seeded with on the next spawn.
        val snapshot = IntellijDeploymentState.getInstance(project).snapshotMap()
        assertEquals("https://engine", snapshot["endpoint"])
        assertEquals("t1", snapshot["tenantId"])
        assertEquals("oauth2", snapshot["authType"])
        assertEquals("https://token", snapshot["tokenEndpoint"])
        assertEquals("zeebe", snapshot["audience"])
        assertEquals("dev", snapshot["activeTargetName"])
    }

    @Test
    fun `save keeps the fields a patch leaves out`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()
        save(wired, mapOf("endpoint" to "https://engine", "tenantId" to "t1"), id = 43)

        save(wired, mapOf("tenantId" to "t2"), id = 44)

        val snapshot = IntellijDeploymentState.getInstance(project).snapshotMap()
        assertEquals("https://engine", snapshot["endpoint"])
        assertEquals("t2", snapshot["tenantId"])
    }

    @Test
    fun `save removes and puts ledger rows in one patch and keeps the others`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()
        val devRow = "target:dev@localhost:8080::/work/a.bpmn"
        val prodRow = "target:prod@localhost:8080::/work/a.bpmn"
        val stagingRow = "target:staging@localhost:8080::/work/a.bpmn"
        val recorded = mapOf(devRow to revision("d1"), prodRow to revision("p1"))
        save(wired, mapOf("ledger" to mapOf("put" to recorded)), id = 50)

        save(
            wired,
            mapOf(
                "ledger" to
                    mapOf(
                        "remove" to listOf(devRow, "target:gone::/x.bpmn"),
                        "put" to mapOf(stagingRow to revision("s1"), prodRow to revision("p2")),
                    ),
            ),
            id = 51,
        )

        val ledger =
            gson.toJsonTree(IntellijDeploymentState.getInstance(project).snapshotMap()["ledger"]).asJsonObject
        assertEquals(setOf(prodRow, stagingRow), ledger.keySet())
        assertEquals("p2", ledger.getAsJsonObject(prodRow).get("fingerprint").asString)
        assertEquals("s1", ledger.getAsJsonObject(stagingRow).get("fingerprint").asString)
    }

    @Test
    fun `save puts a row the same patch removes, as the core does`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()
        val devRow = "target:dev@localhost:8080::/work/a.bpmn"

        val ledgerPatch = mapOf("remove" to listOf(devRow), "put" to mapOf(devRow to revision("d2")))
        save(wired, mapOf("ledger" to ledgerPatch), id = 52)

        val ledger =
            gson.toJsonTree(IntellijDeploymentState.getInstance(project).snapshotMap()["ledger"]).asJsonObject
        assertEquals("d2", ledger.getAsJsonObject(devRow).get("fingerprint").asString)
    }

    /** Dispatches one acknowledged save and asserts the matching empty reply frame. */
    private fun save(
        wired: WiredBridge,
        patch: Map<String, Any>,
        id: Int,
    ) {
        val params = JsonObject().apply { add("patch", wired.channel.gson.toJsonTree(patch)) }
        wired.handlers.dispatch("deploymentState/save", params, id)
        val reply = parse(wired.fake.nextFrame())
        assertEquals(id, reply.get("id").asInt, "deploymentState/save must acknowledge its request id")
        assertFalse(reply.has("method"), "an ack is a reply frame, never another request")
    }
}
