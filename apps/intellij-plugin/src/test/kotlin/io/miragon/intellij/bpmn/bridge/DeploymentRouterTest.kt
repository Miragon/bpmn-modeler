package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import io.miragon.intellij.bpmn.IntellijDeploymentState
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/**
 * Covers that the deployment-state writes are *acknowledged* requests, not
 * fire-and-forget notifications. Each `deploymentState/save*` must persist
 * through [IntellijDeploymentState] (so a getter / re-seed reflects it across an IDE
 * restart) **and** answer the request id, so a failed persist surfaces as a rejected
 * promise on the core instead of being silently dropped.
 *
 * Uses a real project (`projectFixture`) so the project-scoped `PropertiesComponent`
 * the state writes through is the genuine one — the persistence path is the behaviour
 * under test, not a mock of it.
 */
@TestApplication
class DeploymentRouterTest {
    private val projectFixture = projectFixture()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    @Test
    fun `deploymentState save handlers reply to the request id and persist`() {
        val project = projectFixture.get()
        val wired = wireChannel().also { this.wired = it }
        DeploymentRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()

        dispatchSave(wired, "deploymentState/save", mapOf("endpoint" to "https://engine", "tenantId" to "t1"), id = 42)
        dispatchSave(wired, "deploymentState/saveAuthType", mapOf("authType" to "oauth2"), id = 43)
        dispatchSave(
            wired,
            "deploymentState/saveOAuth2Config",
            mapOf("tokenEndpoint" to "https://token", "audience" to "zeebe"),
            id = 44,
        )

        // The persist must have run before the ack, so the live state mirror reflects
        // every saved field — the same snapshot the bridge re-seeds on the next spawn.
        val snapshot = IntellijDeploymentState.getInstance(project).snapshotMap()
        assertEquals("https://engine", snapshot["endpoint"])
        assertEquals("t1", snapshot["tenantId"])
        assertEquals("oauth2", snapshot["authType"])
        assertEquals("https://token", snapshot["tokenEndpoint"])
        assertEquals("zeebe", snapshot["audience"])
    }

    /** Dispatches one acknowledged save and asserts the matching empty reply frame. */
    private fun dispatchSave(
        wired: WiredBridge,
        method: String,
        params: Map<String, String>,
        id: Int,
    ) {
        wired.handlers.dispatch(method, wired.channel.gson.toJsonTree(params).asJsonObject, id)
        val reply = parse(wired.fake.nextFrame())
        assertEquals(id, reply.get("id").asInt, "$method must acknowledge its request id")
        assertFalse(reply.has("method"), "an ack is a reply frame, never another request")
    }
}
