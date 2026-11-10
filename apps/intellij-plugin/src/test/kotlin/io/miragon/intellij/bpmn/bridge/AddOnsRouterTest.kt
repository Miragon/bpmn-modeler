package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.project.Project
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@TestApplication
class AddOnsRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val disposals = mutableListOf<() -> Unit>()

    @AfterEach
    fun tearDown() {
        disposals.forEach { it() }
    }

    private fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

    private class Routed(val wired: WiredBridge, val router: AddOnsRouter)

    private fun routed(
        ensureStartedAsync: () -> Unit = {},
        revealArtifacts: (Project, (Boolean) -> Unit) -> Unit = { _, onDone -> onDone(false) },
    ): Routed {
        val wired =
            wireChannel().also {
                disposals += it::dispose
                disposals += it.fake::close
            }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers, ensureStartedAsync = ensureStartedAsync)
        val router = AddOnsRouter(deps, revealArtifacts)
        router.register()
        return Routed(wired, router)
    }

    /** Detaches the bridge, runs [whileDown], then attaches a new process and returns what it receives. */
    private fun framesAfterRestart(wired: WiredBridge, whileDown: () -> Unit): List<JsonObject> {
        wired.channel.detach()
        whileDown()
        val next = FakeProcess().also { disposals += it::close }
        wired.channel.attach(next.outputStream, next.inputStream)
        return next.framesUntilQuiet().map(::json)
    }

    @Test
    fun `answers a reveal with whether the Artifacts tab is now shown`() {
        val showing = routed(revealArtifacts = { _, onDone -> onDone(true) }).wired
        showing.handlers.dispatch("addOns/reveal", JsonObject(), showing.requestId(3))
        assertEquals(json("""{"id": 3, "result": {"shown": true}}"""), json(showing.fake.nextFrame()))

        val hidden = routed(revealArtifacts = { _, onDone -> onDone(false) }).wired
        hidden.handlers.dispatch("addOns/reveal", JsonObject(), hidden.requestId(4))
        assertEquals(json("""{"id": 4, "result": {"shown": false}}"""), json(hidden.fake.nextFrame()))
    }

    @Test
    fun `answers a reveal with an error when the tool window throws`() {
        val wired = routed(revealArtifacts = { _, _ -> error("tool window gone") }).wired

        wired.handlers.dispatch("addOns/reveal", JsonObject(), wired.requestId(5))

        assertEquals(json("""{"id": 5, "error": "tool window gone"}"""), json(wired.fake.nextFrame()))
    }

    @Test
    fun `delivers the core's messages to the registered page and drops them once it is gone`() {
        val (wired, router) = routed().let { it.wired to it.router }
        val posted = mutableListOf<String>()
        router.registerWindow(post = { posted += it }, reload = {})

        wired.handlers.dispatch("addOns/postMessage", json("""{"message": {"type": "AddOnCatalogQuery"}}"""), null)
        router.unregisterWindow()
        wired.handlers.dispatch("addOns/postMessage", json("""{"message": {"type": "RevealAddOnsQuery"}}"""), null)

        assertEquals(listOf("""{"type":"AddOnCatalogQuery"}"""), posted)
    }

    @Test
    fun `forwards a page message as it is, also across a bridge restart`() {
        val (wired, router) = routed().let { it.wired to it.router }

        val frames = framesAfterRestart(wired) { router.forwardMessage("""{"type":"AddOnRequestCommand","requestId":7}""") }

        assertEquals(
            listOf(json("""{"method": "addOns/webviewMessage", "params": {"message": {"type": "AddOnRequestCommand", "requestId": 7}}}""")),
            frames,
        )
    }

    @Test
    fun `drops a page message that is no JSON`() {
        val (wired, router) = routed().let { it.wired to it.router }

        router.forwardMessage("{not json")

        wired.fake.expectNoFrame()
    }

    @Test
    fun `opens the view with the project root and the settings`() {
        val (wired, router) = routed().let { it.wired to it.router }

        router.setOpen(true)

        val params = json(wired.fake.nextFrame()).also { assertEquals("addOns/open", it.get("method").asString) }.getAsJsonObject("params")
        assertEquals(true, params.get("open").asBoolean)
        assertEquals(projectFixture.get().basePath, params.get("workspaceRoot").asString)
        assertTrue(params.getAsJsonObject("settings").has("configFolder"), params.toString())
    }

    @Test
    fun `leaves the project root out, not null, for a project without one`() {
        val params = addOnsOpenParams(open = true, settings = mapOf("configFolder" to ".camunda"), workspaceRoot = null)

        assertEquals(mapOf("open" to true, "settings" to mapOf("configFolder" to ".camunda")), params)
    }

    @Test
    fun `sends only the last of the visibility changes made while the bridge restarts`() {
        val (wired, router) = routed().let { it.wired to it.router }

        val frames =
            framesAfterRestart(wired) {
                router.setOpen(true)
                router.setOpen(false)
            }

        assertEquals(listOf(false), frames.map { it.getAsJsonObject("params").get("open").asBoolean })
    }

    @Test
    fun `opens a registered view again after a spawn, at its last visibility`() {
        val (wired, router) = routed().let { it.wired to it.router }
        router.followNewProcess()
        wired.fake.expectNoFrame()

        router.registerWindow(post = {}, reload = {})
        router.setOpen(true)
        wired.fake.framesUntilQuiet()
        router.followNewProcess()

        val params = json(wired.fake.nextFrame()).getAsJsonObject("params")
        assertEquals(true, params.get("open").asBoolean)
    }

    @Test
    fun `closes the view when its page is unregistered`() {
        val (wired, router) = routed().let { it.wired to it.router }
        router.registerWindow(post = {}, reload = {})
        router.setOpen(true)
        wired.fake.framesUntilQuiet()

        router.unregisterWindow()
        val closed = json(wired.fake.nextFrame()).getAsJsonObject("params")
        router.followNewProcess()

        assertEquals(false, closed.get("open").asBoolean)
        wired.fake.expectNoFrame()
    }

    @Test
    fun `reloads the registered page when a process replaces another`() {
        val router = routed().router
        var reloads = 0
        router.registerWindow(post = {}, reload = { reloads++ })

        router.followNewProcess()
        router.followNewProcess()

        assertEquals(1, reloads)
    }

    @Test
    fun `asks the core to read the add-ons again`() {
        val (wired, router) = routed().let { it.wired to it.router }

        router.refresh()

        assertEquals(json("""{"method": "addOns/refresh", "params": {}}"""), json(wired.fake.nextFrame()))
    }

    @Test
    fun `starts no bridge to refresh, as a new one reads every add-on anyway`() {
        var starts = 0
        val router = routed(ensureStartedAsync = { starts++ }).router

        router.refresh()

        assertEquals(0, starts)
    }
}
