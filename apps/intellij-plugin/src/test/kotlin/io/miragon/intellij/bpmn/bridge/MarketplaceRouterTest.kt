package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import io.miragon.intellij.bpmn.ModelerSettingsStore
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Covers the [MarketplaceRouter] Core→Host requests and the outbound Tools-menu
 * notifications over the real [RpcChannel] + [RpcHandlerRegistry] transport (a
 * [FakeProcess], per [RouterTestSupport]).
 *
 * The persist path writes through the genuine application-level
 * [ModelerSettingsStore]; the token prompt injects a deterministic stand-in for
 * the modal password dialog (EDT-only, not headless-stubbable). Uniquely-suffixed
 * locations keep the app-level settings from bleeding between assertions.
 */
@TestApplication
class MarketplaceRouterTest {
    private val projectFixture = projectFixture()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    private fun router(prompt: (String, String) -> String? = { _, _ -> null }): Pair<WiredBridge, MarketplaceRouter> {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = MarketplaceRouter(deps, prompt).also { it.register() }
        return wired to router
    }

    @Test
    fun `marketplaceState save persists de-duped and acks the request id`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/repo-${System.nanoTime()}"

        // Two saves of the same location must persist once and ack twice.
        dispatchSave(wired, location, id = 7)
        dispatchSave(wired, location, id = 8)

        val stored = ModelerSettingsStore.getInstance().current().marketplaces
        assertEquals(1, stored.count { it == location }, "duplicate location must be recorded once")
    }

    @Test
    fun `tokenStore set then get round-trips the token`() {
        val (wired, _) = router()
        val host = "github.com"
        val token = "ghp_test_${System.nanoTime()}"

        wired.handlers.dispatch("tokenStore/set", obj("host" to host, "token" to token), 10)
        assertAck(wired, 10)

        wired.handlers.dispatch("tokenStore/get", obj("host" to host), 11)
        val reply = parse(wired.fake.nextFrame())
        assertEquals(11, reply.get("id").asInt)
        assertEquals(token, reply.getAsJsonObject("result").get("token").asString)
    }

    @Test
    fun `tokenStore get replies null for an unknown host`() {
        val (wired, _) = router()
        wired.handlers.dispatch("tokenStore/get", obj("host" to "unknown-${System.nanoTime()}.example"), 12)
        val reply = parse(wired.fake.nextFrame())
        assertEquals(12, reply.get("id").asInt)
        assertNullResult(reply)
    }

    @Test
    fun `tokenPrompt reply carries the granted token`() {
        val (wired, _) = router(prompt = { _, _ -> "  ghp_granted  " })
        wired.handlers.dispatch("tokenPrompt/show", obj("host" to "github.com", "reason" to "why"), 20)
        ApplicationManager.getApplication().invokeAndWait { }
        val reply = parse(wired.fake.nextFrame())
        assertEquals(20, reply.get("id").asInt)
        // The host trims the entry before it ever reaches the core.
        assertEquals("ghp_granted", reply.getAsJsonObject("result").get("token").asString)
    }

    @Test
    fun `tokenPrompt reply is null on decline`() {
        val (wired, _) = router(prompt = { _, _ -> null })
        wired.handlers.dispatch("tokenPrompt/show", obj("host" to "github.com", "reason" to "why"), 21)
        ApplicationManager.getApplication().invokeAndWait { }
        val reply = parse(wired.fake.nextFrame())
        assertEquals(21, reply.get("id").asInt)
        assertNullResult(reply)
    }

    @Test
    fun `addMarketplace notification carries the location and the settings snapshot`() {
        val (wired, router) = router()
        router.addMarketplace("~/local/marketplace")

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/add", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals("~/local/marketplace", params.get("location").asString)
        // The piggybacked snapshot must be the full settings map (so the run never
        // depends on a prior register seed), including the marketplace list itself.
        val settings = params.getAsJsonObject("settings")
        assertTrue(settings.has("marketplaces"), "snapshot must carry the marketplace list")
        assertTrue(settings.has("configFolder"), "snapshot must be the full settings map")
    }

    @Test
    fun `updateMarketplaces notification carries the settings snapshot`() {
        val (wired, router) = router()
        router.updateMarketplaces()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/update", frame.get("method").asString)
        assertTrue(
            frame.getAsJsonObject("params").getAsJsonObject("settings").has("marketplaces"),
            "update must piggyback the marketplace list the core re-reads",
        )
    }

    private fun dispatchSave(wired: WiredBridge, location: String, id: Int) {
        wired.handlers.dispatch("marketplaceState/save", obj("location" to location), id)
        assertAck(wired, id)
    }

    /** A null RPC result: Gson (serializeNulls off) omits the key entirely on the wire. */
    private fun assertNullResult(reply: JsonObject) {
        val result = reply.get("result")
        assertTrue(result == null || result.isJsonNull, "must reply a null result")
    }

    private fun assertAck(wired: WiredBridge, id: Int) {
        val reply = parse(wired.fake.nextFrame())
        assertEquals(id, reply.get("id").asInt, "must acknowledge its request id")
        assertFalse(reply.has("method"), "an ack is a reply frame, never another request")
    }

    private fun obj(vararg pairs: Pair<String, String>): JsonObject =
        gson.toJsonTree(mapOf(*pairs)).asJsonObject
}
