package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.trustedProjects.TrustedProjectsListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@TestApplication
class WorkspaceTrustRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun parse(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    private fun routers(
        isTrusted: () -> Boolean,
        isProcessAlive: () -> Boolean = { true },
    ): Pair<WiredBridge, BridgeRouters> {
        val wired = wireChannel().also { this.wired = it }
        val deps =
            bridgeDeps(
                projectFixture.get(),
                wired.channel,
                wired.handlers,
                isProcessAlive = isProcessAlive,
                projectTrust = ProjectTrust(isTrusted),
            )
        return wired to BridgeRouters(deps).also { it.register() }
    }

    private fun publisher(): TrustedProjectsListener =
        ApplicationManager.getApplication().messageBus.syncPublisher(TrustedProjectsListener.TOPIC)

    /** A push carries the trust as its params, a register under `workspaceTrust`. */
    private fun trustOf(frame: JsonObject): JsonObject =
        if (frame.get("method").asString == "workspaceTrust/didChange") {
            frame.getAsJsonObject("params")
        } else {
            frame.getAsJsonObject("params").getAsJsonObject("workspaceTrust")
        }

    @Test
    fun `every register carries the project's trust, each under a newer revision`() {
        val (wired, routers) = routers(isTrusted = { false })
        val file = LightVirtualFile("process.bpmn", "<definitions/>")
        val session = CoreSession(file.url, file, projectFixture.get()) {}

        routers.editor.registerSession(session)
        val first = trustOf(parse(wired.fake.nextFrame()))
        routers.editor.registerSession(session)
        val second = trustOf(parse(wired.fake.nextFrame()))

        assertEquals(false, first.get("trusted").asBoolean)
        assertEquals(false, second.get("trusted").asBoolean)
        assertTrue(second.get("revision").asLong > first.get("revision").asLong)
    }

    @Test
    fun `pushes the project's trust once the IDE announces that the user trusted it, and once it withdraws it`() {
        var trusted = false
        val (wired, _) = routers(isTrusted = { trusted })

        trusted = true
        publisher().onProjectTrusted(projectFixture.get())
        val granted = parse(wired.fake.nextFrame())
        trusted = false
        publisher().onProjectUntrusted(projectFixture.get())
        val withdrawn = parse(wired.fake.nextFrame())

        assertEquals("workspaceTrust/didChange", granted.get("method").asString)
        assertEquals(true, trustOf(granted).get("trusted").asBoolean)
        assertEquals(false, trustOf(withdrawn).get("trusted").asBoolean)
        assertTrue(trustOf(withdrawn).get("revision").asLong > trustOf(granted).get("revision").asLong)
    }

    @Test
    fun `pushes the project's trust when the user trusts it from the IDE's notification`() {
        val (wired, _) = routers(isTrusted = { true })

        publisher().onProjectTrustedFromNotification(projectFixture.get())

        assertEquals(true, trustOf(parse(wired.fake.nextFrame())).get("trusted").asBoolean)
    }

    @Test
    fun `a spawn seeds the trust the user changed while the bridge was still starting`() {
        var alive = false
        var trusted = false
        val (wired, routers) = routers(isTrusted = { trusted }, isProcessAlive = { alive })

        trusted = true
        publisher().onProjectTrusted(projectFixture.get())
        alive = true
        routers.seedAfterSpawn()

        val pushes =
            wired.fake.framesUntilQuiet().map(::parse).filter { it.get("method").asString == "workspaceTrust/didChange" }
        assertEquals(listOf(true), pushes.map { it.getAsJsonObject("params").get("trusted").asBoolean })
    }
}
