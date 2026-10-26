package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

/**
 * Pins the IntelliJ host to the bridge's committed protocol descriptor: every
 * core→host method has a Kotlin handler and every handler serves one of them.
 * A second handler for the same method already throws in [RpcHandlerRegistry.on],
 * so together the host has exactly one handler per core→host method.
 */
@TestApplication
class ProtocolHandlerCoverageTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    @Test
    fun `handles every core-to-host method of the protocol descriptor`() {
        val unhandled = coreToHostMethods() - registeredMethods()

        assertEquals(emptySet<String>(), unhandled, "core→host methods without a Kotlin handler")
    }

    @Test
    fun `registers no handler for a method the core does not send to the host`() {
        val stale = registeredMethods() - coreToHostMethods()

        assertEquals(emptySet<String>(), stale, "Kotlin handlers for no core→host method")
    }

    private fun registeredMethods(): Set<String> {
        val wired = wireChannel().also { this.wired = it }
        val project = projectFixture.get()
        // ScriptRouter subscribes to the project's message bus; tie that to the project.
        val routersDisposable = Disposer.newDisposable(project, "bridge-routers")
        BridgeRouters(bridgeDeps(project, wired.channel, wired.handlers, routersDisposable)).register()
        return wired.handlers.registeredMethods()
    }

    private fun coreToHostMethods(): Set<String> {
        val descriptorPath =
            requireNotNull(System.getProperty("miragon.protocolDescriptor")) {
                "miragon.protocolDescriptor is unset; run the test through Gradle"
            }
        return JsonParser.parseString(Files.readString(Path.of(descriptorPath))).asJsonArray
            .map { it.asJsonObject }
            .filter { it.get("direction").asString == "coreToHost" }
            .map { it.get("method").asString }
            .toSet()
    }
}
