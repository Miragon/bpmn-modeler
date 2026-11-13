package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.MarketplaceAddAnswer
import io.miragon.intellij.bpmn.MarketplaceAddQuestion
import io.miragon.intellij.bpmn.MarketplaceScopeChoice
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.ProjectMarketplacesStore
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import io.miragon.intellij.bpmn.readTypeScriptJson
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
 * [ModelerSettingsStore]; the token prompt and the add form inject deterministic
 * stand-ins for their modal dialogs (EDT-only, not headless-stubbable).
 * Uniquely-suffixed locations keep the app-level settings from bleeding between
 * assertions.
 */
@TestApplication
class MarketplaceRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    private val tokenPromptParams: JsonObject
        get() = obj("title" to "Personal Access Token for github.com", "prompt" to "why")

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = gson.fromJson(line, JsonObject::class.java)

    private fun <T> parse(json: String, type: Class<T>): T = gson.fromJson(json, type)

    private fun router(
        prompt: (String, String) -> String? = { _, _ -> null },
        addForm: (MarketplaceAddQuestion) -> MarketplaceAddAnswer? = { null },
    ): Pair<WiredBridge, MarketplaceRouter> {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = MarketplaceRouter(deps, prompt, addForm, pushToRunningBridges = {}, pushToOwnBridge = {}).also { it.register() }
        return wired to router
    }

    /**
     * A router whose pushes send the snapshot as `SettingsRouter.push`
     * does, recording whether a push went to every running bridge or only to this
     * project's.
     */
    private fun routerRecordingPushes(): Pair<WiredBridge, List<String>> {
        val wired = wireChannel().also { this.wired = it }
        val pushedTo = mutableListOf<String>()
        fun push(bridges: String): () -> Unit = {
            pushedTo += bridges
            wired.channel.notify(
                HostToCoreMethod.SETTINGS_DID_CHANGE,
                linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap(projectFixture.get())),
            )
        }
        MarketplaceRouter(
            bridgeDeps(projectFixture.get(), wired.channel, wired.handlers),
            pushToRunningBridges = push(EVERY_BRIDGE),
            pushToOwnBridge = push(OWN_BRIDGE),
        ).register()
        return wired to pushedTo
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
    fun `marketplaceState save for all projects lands in the app-level list, not the project store`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/app-wide-${System.nanoTime()}"
        // App-level settings are shared across the @TestApplication; restore them.
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        try {
            dispatchSave(wired, location, id = 30, scope = "allProjects")

            assertTrue(
                store.current().marketplaces.contains(location),
                "an application-scoped save must persist to the app-level list",
            )
            assertFalse(
                ProjectMarketplacesStore.getInstance(projectFixture.get()).list().contains(location),
                "an application-scoped save must not touch the per-project store",
            )
        } finally {
            store.update { before }
        }
    }

    @Test
    fun `marketplaceState save for this project writes the project list even when the app-level list holds the location`() {
        val (wired, _) = router()
        val location = "https://github.com/owner/app-repo-${System.nanoTime()}"
        // The core decides whether an add registers anything; the store only appends.
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update { before.copy(marketplaces = before.marketplaces + location) }
        try {
            dispatchSave(wired, location, id = 9)

            assertEquals(
                listOf(location),
                ProjectMarketplacesStore.getInstance(projectFixture.get()).list().filter { it == location },
                "the save must land in the project list once",
            )
        } finally {
            // App-level settings are shared across the @TestApplication; restore them.
            store.update { before }
        }
    }

    @Test
    fun `tokenStore set then get round-trips the token`() {
        val (wired, _) = router()
        val host = "github.com"
        val token = "ghp_test_${System.nanoTime()}"

        wired.handlers.dispatch("tokenStore/set", obj("host" to host, "token" to token), wired.requestId(10))
        assertAck(wired, 10)

        wired.handlers.dispatch("tokenStore/get", obj("host" to host), wired.requestId(11))
        val reply = parse(wired.fake.nextFrame())
        assertEquals(11, reply.get("id").asInt)
        assertEquals(token, reply.getAsJsonObject("result").get("token").asString)
    }

    @Test
    fun `tokenStore get replies null for an unknown host`() {
        val (wired, _) = router()
        wired.handlers.dispatch("tokenStore/get", obj("host" to "unknown-${System.nanoTime()}.example"), wired.requestId(12))
        val reply = parse(wired.fake.nextFrame())
        assertEquals(12, reply.get("id").asInt)
        assertNullResult(reply)
    }

    @Test
    fun `dispatches the next frame while a token read is still blocked`() {
        val (wired, _) = router()

        assertNextFrameIsDispatchedWhileReadWaitsForKeychain(
            wired,
            """{"method":"tokenStore/get","params":{"host":"github.com"},"id":42}""",
            readRequestId = 42,
        )
    }

    @Test
    fun `tokenPrompt shows the core's title and prompt and replies the answer as typed`() {
        val shown = mutableListOf<Pair<String, String>>()
        val (wired, _) = router(prompt = { title, prompt -> "  ghp_granted  ".also { shown += title to prompt } })
        wired.handlers.dispatch("tokenPrompt/show", tokenPromptParams, wired.requestId(20))
        ApplicationManager.getApplication().invokeAndWait { }
        val reply = parse(wired.fake.nextFrame())
        assertEquals(20, reply.get("id").asInt)
        assertEquals(listOf("Personal Access Token for github.com" to "why"), shown)
        assertEquals("  ghp_granted  ", reply.getAsJsonObject("result").get("token").asString)
    }

    @Test
    fun `tokenPrompt reply is null on cancel`() {
        val (wired, _) = router(prompt = { _, _ -> null })
        wired.handlers.dispatch("tokenPrompt/show", tokenPromptParams, wired.requestId(21))
        ApplicationManager.getApplication().invokeAndWait { }
        val reply = parse(wired.fake.nextFrame())
        assertEquals(21, reply.get("id").asInt)
        assertNullResult(reply)
    }

    @Test
    fun `tokenPrompt answers with an error when the prompt throws`() {
        val (wired, _) = router(prompt = { _, _ -> throw IllegalStateException("dialog failed") })
        wired.handlers.dispatch("tokenPrompt/show", tokenPromptParams, wired.requestId(22))
        ApplicationManager.getApplication().invokeAndWait { }
        val reply = parse(wired.fake.nextFrame())
        assertEquals(22, reply.get("id").asInt)
        assertEquals("dialog failed", reply.get("error").asString)
    }

    @Test
    fun `marketplacePrompt shows the core's question in one form and replies the answer as entered`() {
        val asked = mutableListOf<MarketplaceAddQuestion>()
        val (wired, _) =
            router(addForm = { question -> MarketplaceAddAnswer(" ~/templates ", "allProjects").also { asked += question } })

        wired.handlers.dispatch("marketplacePrompt/show", addQuestionParams(), wired.requestId(40))
        ApplicationManager.getApplication().invokeAndWait { }

        assertEquals(
            listOf(
                MarketplaceAddQuestion(
                    title = "Add Template Marketplace",
                    prompt = "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
                    placeholder = "https://github.com/owner/repo  or  ~/path/to/folder",
                    location = "acme",
                    invalidLocation = "Enter a GitHub or GitLab repository URL.",
                    scopes =
                        listOf(
                            MarketplaceScopeChoice("project", "Register for this project", "Saved in .idea/workspace.xml"),
                            MarketplaceScopeChoice("allProjects", "Register for all my projects", "Saved in Settings"),
                        ),
                    scope = "project",
                ),
            ),
            asked,
        )
        val reply = parse(wired.fake.nextFrame())
        assertEquals(40, reply.get("id").asInt)
        val result = reply.getAsJsonObject("result")
        assertEquals(" ~/templates ", result.get("location").asString)
        assertEquals("allProjects", result.get("scope").asString)
    }

    @Test
    fun `marketplacePrompt reply is null on cancel`() {
        val (wired, _) = router(addForm = { null })

        wired.handlers.dispatch("marketplacePrompt/show", addQuestionParams(), wired.requestId(41))
        ApplicationManager.getApplication().invokeAndWait { }

        val reply = parse(wired.fake.nextFrame())
        assertEquals(41, reply.get("id").asInt)
        assertNullResult(reply)
    }

    @Test
    fun `marketplaceState read replies each scope's own list and where IntelliJ saves each scope`() {
        val (wired, _) = router()
        val shared = "https://github.com/owner/shared-${System.nanoTime()}"
        val projectOnly = "https://github.com/owner/project-${System.nanoTime()}"
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update { before.copy(marketplaces = before.marketplaces + shared) }
        val projectStore = ProjectMarketplacesStore.getInstance(projectFixture.get())
        projectStore.add(projectOnly)
        try {
            wired.handlers.dispatch("marketplaceState/read", JsonObject(), wired.requestId(42))

            val result = parse(wired.fake.nextFrame()).getAsJsonObject("result")
            val registered = result.getAsJsonObject("registered")
            assertEquals(store.current().marketplaces, entriesOf(registered, "allProjects"))
            assertEquals(projectStore.list(), entriesOf(registered, "project"))
            assertTrue(entriesOf(registered, "allProjects").contains(shared))
            assertTrue(entriesOf(registered, "project").contains(projectOnly))
            assertEquals(readTypeScriptJson("miragon.intellijWritableScopes"), result.getAsJsonArray("writable"))
            assertFalse(result.has("selfHostedIn"), "IntelliJ has no place for a self-hosted marketplace")
        } finally {
            store.update { before }
        }
    }

    @Test
    fun `marketplaceState remove drops the entries from both stores and acks`() {
        val (wired, _) = router()
        val shared = "https://github.com/owner/shared-${System.nanoTime()}"
        val keep = "https://github.com/owner/keep-${System.nanoTime()}"
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update { before.copy(marketplaces = before.marketplaces + shared) }
        val projectStore = ProjectMarketplacesStore.getInstance(projectFixture.get())
        projectStore.add(keep)
        try {
            val params = JsonObject().apply { add("entries", gson.toJsonTree(listOf(shared))) }
            wired.handlers.dispatch("marketplaceState/remove", params, wired.requestId(43))
            assertAck(wired, 43)

            assertFalse(store.current().marketplaces.contains(shared), "the app-level entry must be removed")
            assertEquals(listOf(keep), projectStore.list().filter { it == keep }, "an unchosen entry must survive")
        } finally {
            store.update { before }
        }
    }

    @Test
    fun `marketplaceState remove of a project entry pushes the reduced list to this project's bridge before it acks`() {
        val (wired, pushedTo) = routerRecordingPushes()
        val projectStore = ProjectMarketplacesStore.getInstance(projectFixture.get())
        val drop = "https://github.com/owner/pdrop-${System.nanoTime()}"
        val keep = "https://github.com/owner/pkeep-${System.nanoTime()}"
        projectStore.add(drop)
        projectStore.add(keep)

        wired.handlers.dispatch("marketplaceState/remove", entriesParams(drop), wired.requestId(50))

        val pushed = marketplacesPushedBeforeAck(wired, 50)
        assertFalse(pushed.contains(drop), "the prune must read the list without the removed entry")
        assertTrue(pushed.contains(keep), "the push must carry the entries that stay")
        assertEquals(listOf(OWN_BRIDGE), pushedTo)
    }

    @Test
    fun `marketplaceState remove of an app-level entry pushes the reduced list to every running bridge before it acks`() {
        val (wired, pushedTo) = routerRecordingPushes()
        val drop = "https://github.com/owner/drop-${System.nanoTime()}"
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        store.update { before.copy(marketplaces = before.marketplaces + drop) }
        try {
            wired.handlers.dispatch("marketplaceState/remove", entriesParams(drop), wired.requestId(51))

            assertFalse(marketplacesPushedBeforeAck(wired, 51).contains(drop), "every window's list lost the entry")
            assertEquals(listOf(EVERY_BRIDGE), pushedTo)
        } finally {
            store.update { before }
        }
    }

    @Test
    fun `marketplaceState save for this project pushes the new list to this project's bridge before it acks`() {
        val (wired, pushedTo) = routerRecordingPushes()
        val location = "https://github.com/owner/psave-${System.nanoTime()}"

        wired.handlers.dispatch("marketplaceState/save", obj("location" to location, "scope" to "project"), wired.requestId(52))

        assertTrue(marketplacesPushedBeforeAck(wired, 52).contains(location), "the core must read the new entry")
        assertEquals(listOf(OWN_BRIDGE), pushedTo)
    }

    @Test
    fun `marketplaceState save for all projects pushes the new list to every running bridge before it acks`() {
        val (wired, pushedTo) = routerRecordingPushes()
        val location = "https://github.com/owner/asave-${System.nanoTime()}"
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        try {
            wired.handlers.dispatch(
                "marketplaceState/save",
                obj("location" to location, "scope" to "allProjects"),
                wired.requestId(53),
            )

            assertTrue(marketplacesPushedBeforeAck(wired, 53).contains(location), "every window's list gained the entry")
            assertEquals(listOf(EVERY_BRIDGE), pushedTo)
        } finally {
            store.update { before }
        }
    }

    @Test
    fun `addMarketplace notification carries only the settings snapshot`() {
        val (wired, router) = router()
        router.addMarketplace()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/add", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals(setOf("settings"), params.keySet())
        // The full settings map, so the run never depends on a prior register seed.
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

    @Test
    fun `removeMarketplaces notification carries only the settings snapshot`() {
        val (wired, router) = router()
        router.removeMarketplaces()

        val frame = parse(wired.fake.nextFrame())
        assertEquals("marketplace/remove", frame.get("method").asString)
        val params = frame.getAsJsonObject("params")
        assertEquals(setOf("settings"), params.keySet())
        assertTrue(params.getAsJsonObject("settings").has("marketplaces"), "remove must piggyback the marketplace list")
    }

    @Test
    fun `app-level removeMarketplaces drops only the listed entries and leaves the rest`() {
        router()
        val store = ModelerSettingsStore.getInstance()
        val before = store.current()
        val keep = "https://github.com/owner/keep-${System.nanoTime()}"
        val drop = "https://github.com/owner/drop-${System.nanoTime()}"
        store.update { before.copy(marketplaces = before.marketplaces + keep + drop) }
        try {
            store.removeMarketplaces(setOf(drop))

            val after = store.current().marketplaces
            assertTrue(after.contains(keep), "an unlisted app-level entry must survive")
            assertFalse(after.contains(drop), "a listed app-level entry must be removed")
        } finally {
            store.update { before }
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
        store.update { before.copy(marketplaces = before.marketplaces + appEntry) }
        ProjectMarketplacesStore.getInstance(projectFixture.get()).add(projectEntry)
        try {
            router.updateMarketplaces()

            val settings = parse(wired.fake.nextFrame()).getAsJsonObject("params").getAsJsonObject("settings")
            val marketplaces = settings.getAsJsonArray("marketplaces").map { it.asString }
            assertTrue(marketplaces.contains(appEntry), "snapshot must carry the app-level entry")
            assertTrue(marketplaces.contains(projectEntry), "snapshot must carry the project-level entry")
        } finally {
            store.update { before }
        }
    }

    private fun dispatchSave(wired: WiredBridge, location: String, id: Int, scope: String = "project") {
        wired.handlers.dispatch("marketplaceState/save", obj("location" to location, "scope" to scope), wired.requestId(id))
        assertAck(wired, id)
    }

    private fun addQuestionParams(): JsonObject =
        parse(
            """{
            "title":"Add Template Marketplace",
            "prompt":"GitHub or GitLab repository, or a local folder, holding a marketplace.json",
            "placeholder":"https://github.com/owner/repo  or  ~/path/to/folder",
            "location":"acme",
            "invalidLocation":"Enter a GitHub or GitLab repository URL.",
            "scopes":[
              {"scope":"project","label":"Register for this project","description":"Saved in .idea/workspace.xml"},
              {"scope":"allProjects","label":"Register for all my projects","description":"Saved in Settings"}
            ],
            "scope":"project"
            }""",
        )

    private fun entriesParams(vararg locations: String): JsonObject =
        JsonObject().apply { add("entries", gson.toJsonTree(locations.toList())) }

    /** The marketplaces of the snapshot pushed right before the ack of [id]. */
    private fun marketplacesPushedBeforeAck(wired: WiredBridge, id: Int): List<String> {
        val push = parse(wired.fake.nextFrame())
        assertEquals("settings/didChange", push.get("method")?.asString, "the push must precede the ack")
        assertAck(wired, id)
        return push.getAsJsonObject("params").getAsJsonObject("settings").getAsJsonArray("marketplaces").map { it.asString }
    }

    private fun entriesOf(registered: JsonObject, scope: String): List<String> =
        registered.getAsJsonArray(scope).map { it.asString }

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

    private companion object {
        const val EVERY_BRIDGE = "every running bridge"
        const val OWN_BRIDGE = "this project's bridge"
    }
}
