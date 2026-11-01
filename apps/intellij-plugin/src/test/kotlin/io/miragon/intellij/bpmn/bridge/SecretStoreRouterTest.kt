package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

// PasswordSafe runs on an in-memory store in unit-test mode, so nothing reaches the OS keychain.
@TestApplication
class SecretStoreRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    private var nextRequestId = 100

    @AfterEach
    fun tearDown() {
        wired?.let { request(it, "secretStore/delete", mapOf("slot" to SLOT)) }
        wired?.let { request(it, "secretStore/delete", mapOf("slot" to OTHER_SLOT)) }
        wired?.dispose()
    }

    private fun registeredRouter(): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        SecretStoreRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)).register()
        return wired
    }

    private fun request(wired: WiredBridge, method: String, params: Map<String, Any?>): JsonElement? {
        val requestId = nextRequestId++
        wired.handlers.dispatch(method, gson.toJsonTree(params).asJsonObject, wired.requestId(requestId))
        val reply = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals(requestId, reply.get("id").asInt, "$method must answer its own request id")
        return reply.get("result")?.takeUnless { it.isJsonNull }
    }

    @Test
    fun `basic auth round-trips per slot`() {
        val wired = registeredRouter()

        request(wired, "secretStore/saveBasicAuth", mapOf("username" to "demo", "password" to "s3cret", "slot" to SLOT))

        val stored = request(wired, "secretStore/getBasicAuth", mapOf("slot" to SLOT))!!.asJsonObject
        assertEquals("demo", stored.get("username").asString)
        assertEquals("s3cret", stored.get("password").asString)
        assertNull(request(wired, "secretStore/getBasicAuth", mapOf("slot" to OTHER_SLOT)))
    }

    @Test
    fun `oauth2 credentials round-trip per slot`() {
        val wired = registeredRouter()

        request(wired, "secretStore/saveOAuth2", mapOf("clientId" to "zeebe", "clientSecret" to "xyz", "slot" to SLOT))

        val stored = request(wired, "secretStore/getOAuth2", mapOf("slot" to SLOT))!!.asJsonObject
        assertEquals("zeebe", stored.get("clientId").asString)
        assertEquals("xyz", stored.get("clientSecret").asString)
        assertNull(request(wired, "secretStore/getOAuth2", mapOf("slot" to OTHER_SLOT)))
    }

    @Test
    fun `approved destinations round-trip and are absent until saved`() {
        val wired = registeredRouter()
        assertNull(request(wired, "secretStore/getApprovedDestinations", mapOf("slot" to SLOT)))

        request(
            wired,
            "secretStore/saveApprovedDestinations",
            mapOf("slot" to SLOT, "origins" to listOf("https://a.example", "https://b.example")),
        )

        val stored = request(wired, "secretStore/getApprovedDestinations", mapOf("slot" to SLOT))!!.asJsonObject
        assertEquals(listOf("https://a.example", "https://b.example"), stored.getAsJsonArray("origins").map { it.asString })
    }

    @Test
    fun `delete removes every secret kind under the slot only`() {
        val wired = registeredRouter()
        request(wired, "secretStore/saveBasicAuth", mapOf("username" to "u", "password" to "p", "slot" to SLOT))
        request(wired, "secretStore/saveOAuth2", mapOf("clientId" to "c", "clientSecret" to "s", "slot" to SLOT))
        request(wired, "secretStore/saveApprovedDestinations", mapOf("slot" to SLOT, "origins" to listOf("https://a")))
        request(wired, "secretStore/saveBasicAuth", mapOf("username" to "kept", "password" to "p", "slot" to OTHER_SLOT))

        request(wired, "secretStore/delete", mapOf("slot" to SLOT))

        assertNull(request(wired, "secretStore/getBasicAuth", mapOf("slot" to SLOT)))
        assertNull(request(wired, "secretStore/getOAuth2", mapOf("slot" to SLOT)))
        assertNull(request(wired, "secretStore/getApprovedDestinations", mapOf("slot" to SLOT)))
        val kept = request(wired, "secretStore/getBasicAuth", mapOf("slot" to OTHER_SLOT))!!.asJsonObject
        assertEquals("kept", kept.get("username").asString)
    }

    @Test
    fun `an absent slot addresses the legacy unnamed keys`() {
        val wired = registeredRouter()

        request(wired, "secretStore/saveBasicAuth", mapOf("username" to "legacy", "password" to "p"))

        val stored = request(wired, "secretStore/getBasicAuth", mapOf("slot" to null))!!.asJsonObject
        assertEquals("legacy", stored.get("username").asString)
        assertNull(request(wired, "secretStore/getBasicAuth", mapOf("slot" to SLOT)))
    }

    private companion object {
        const val SLOT = "/ws/.camunda/deployment-targets.json::dev"
        const val OTHER_SLOT = "/ws/.camunda/deployment-targets.json::prod"
    }
}
