package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.junit5.fixture.projectFixture
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.ProjectMarketplacesStore
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
    fun `marketplaceState save persists to the project store, not the app-level list`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/repo-${System.nanoTime()}"

        // Two saves of the same location must persist once and ack twice.
        dispatchSave(wired, location, id = 7)
        dispatchSave(wired, location, id = 8)

        val projectList = ProjectMarketplacesStore.getInstance(projectFixture.get()).list()
        assertEquals(1, projectList.count { it == location }, "duplicate location must be recorded once")
        val appList = ModelerSettingsStore.getInstance().current().marketplaces
        assertFalse(appList.contains(location), "the registration must not leak into the app-level list")
    }

    @Test
    fun `marketplaceState save with application scope lands in the app-level list, not the project store`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/app-wide-${System.nanoTime()}"
        // App-level settings are shared across the @TestApplication; restore them.
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        try {
            dispatchSave(wired, location, id = 30, scope = "application")

            assertTrue(
                store.current().marketplaces.contains(location),
                "an application-scoped save must persist to the app-level list",
            )
            assertFalse(
                ProjectMarketplacesStore.getInstance(projectFixture.get()).list().contains(location),
                "an application-scoped save must not touch the per-project store",
            )
        } finally {
            store.update(before)
        }
    }

    @Test
    fun `marketplaceState save is a no-op when the location already lives in the app-level list`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/app-repo-${System.nanoTime()}"
        // Seed the app-level list; the save must dedupe against the union.
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update(before.copy(marketplaces = before.marketplaces + location))
        try {
            dispatchSave(wired, location, id = 9)

            assertFalse(
                ProjectMarketplacesStore.getInstance(projectFixture.get()).list().contains(location),
                "a location already in the app-level list must not be re-added per project",
            )
        } finally {
            // App-level settings are shared across the @TestApplication; restore them.
            store.update(before)
        }
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
    fun `addMarketplace notification carries the location, scope, and the settings snapshot`() {
        val (wired, router) = router()
        router.addMarketplace("~/local/marketplace", appWide = false)

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/add", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals("~/local/marketplace", params.get("location").asString)
        // Unchecked "Register for all projects" → per-project scope.
        assertEquals("project", params.get("scope").asString)
        // The piggybacked snapshot must be the full settings map (so the run never
        // depends on a prior register seed), including the marketplace list itself.
        val settings = params.getAsJsonObject("settings")
        assertTrue(settings.has("marketplaces"), "snapshot must carry the marketplace list")
        assertTrue(settings.has("configFolder"), "snapshot must be the full settings map")
    }

    @Test
    fun `addMarketplace notification carries the application scope when registered app-wide`() {
        val (wired, router) = router()
        router.addMarketplace("~/local/marketplace", appWide = true)

        val params = parse(wired.fake.nextFrame()).getAsJsonObject("params")
        // Checked "Register for all projects" → app-level scope.
        assertEquals("application", params.get("scope").asString)
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

    @Test
    fun `removeMarketplaces notification carries the settings snapshot and the removed count`() {
        val (wired, router) = router()
        router.removeMarketplaces(removedCount = 3)

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/remove", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        // The core prunes against the post-removal list, so the snapshot must ride along.
        assertTrue(
            params.getAsJsonObject("settings").has("marketplaces"),
            "remove must piggyback the post-removal marketplace list the core prunes against",
        )
        // The selection count feeds the summary toast (not the prune count).
        assertEquals(3, params.get("removedCount").asInt)
    }

    @Test
    fun `app-level removeMarketplaces drops only the listed entries and leaves the rest`() {
        router()
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        val keep = "https://github.com/owner/keep-${System.nanoTime()}"
        val drop = "https://github.com/owner/drop-${System.nanoTime()}"
        store.update(before.copy(marketplaces = before.marketplaces + keep + drop))
        try {
            store.removeMarketplaces(setOf(drop))

            val after = store.current().marketplaces
            assertTrue(after.contains(keep), "an unlisted app-level entry must survive")
            assertFalse(after.contains(drop), "a listed app-level entry must be removed")
        } finally {
            store.update(before)
        }
    }

    @Test
    fun `project-level remove drops only the listed entries`() {
        router()
        val projectStore = ProjectMarketplacesStore.getInstance(projectFixture.get())
        val keep = "https://github.com/owner/pkeep-${System.nanoTime()}"
        val drop = "https://github.com/owner/pdrop-${System.nanoTime()}"
        projectStore.add(keep)
        projectStore.add(drop)

        projectStore.remove(setOf(drop))

        val after = projectStore.list()
        assertTrue(after.contains(keep), "an unlisted project entry must survive")
        assertFalse(after.contains(drop), "a listed project entry must be removed")
    }

    @Test
    fun `snapshot unions the app-level and project-level marketplace lists`() {
        val (wired, router) = router()
        val appEntry = "https://github.com/owner/app-${System.nanoTime()}"
        val projectEntry = "https://github.com/owner/project-${System.nanoTime()}"
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update(before.copy(marketplaces = before.marketplaces + appEntry))
        ProjectMarketplacesStore.getInstance(projectFixture.get()).add(projectEntry)
        try {
            router.updateMarketplaces()

            val settings = parse(wired.fake.nextFrame()).getAsJsonObject("params").getAsJsonObject("settings")
            val marketplaces = settings.getAsJsonArray("marketplaces").map { it.asString }
            assertTrue(marketplaces.contains(appEntry), "snapshot must carry the app-level entry")
            assertTrue(marketplaces.contains(projectEntry), "snapshot must carry the project-level entry")
        } finally {
            store.update(before)
        }
    }

    private fun dispatchSave(wired: WiredBridge, location: String, id: Int, scope: String? = null) {
        val params = obj("location" to location)
        if (scope != null) params.addProperty("scope", scope)
        wired.handlers.dispatch("marketplaceState/save", params, id)
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
