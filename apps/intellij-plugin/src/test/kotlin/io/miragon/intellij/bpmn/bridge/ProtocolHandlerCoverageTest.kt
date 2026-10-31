package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonParser
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pins the IntelliJ host to the bridge's committed protocol descriptor: every
 * core→host method has a Kotlin handler and every handler serves one of them.
 * A second handler for the same method already throws in [RpcHandlerRegistry.on],
 * so together the host has exactly one handler per core→host method.
 */
@TestApplication
class ProtocolHandlerCoverageTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val descriptor = ProtocolDescriptor.load()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    @Test
    fun `handles every core-to-host method of the protocol descriptor`() {
        val unhandled = descriptor.coreToHostMethods() - registeredMethods()

        assertEquals(emptySet<String>(), unhandled, "core→host methods without a Kotlin handler")
    }

    @Test
    fun `registers no handler for a method the core does not send to the host`() {
        val stale = registeredMethods() - descriptor.coreToHostMethods()

        assertEquals(emptySet<String>(), stale, "Kotlin handlers for no core→host method")
    }

    @Test
    fun `reports a host-to-core key the descriptor renamed`() {
        val renamed = descriptorWithParamKeys("deployment/switchTarget", "projectRoot")

        assertEquals(
            listOf("deployment/switchTarget sends [workspaceRoot], the descriptor lists [projectRoot]"),
            renamed.hostToCoreDrift(sentFrames()),
        )
    }

    @Test
    fun `reports a core-to-host key the descriptor renamed`() {
        val renamed = descriptorWithParamKeys("notifier/showInfo", "text")

        assertEquals(
            listOf("notifier/showInfo reads [message], the descriptor lists [text]"),
            renamed.coreToHostReadDrift(keysReadByHandlers()),
        )
    }

    private fun registeredMethods(): Set<String> = registeredRouters().handlers.registeredMethods()

    private fun registeredRouters(): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        val project = projectFixture.get()
        // ScriptRouter subscribes to the project's message bus; tie that to the project.
        val routersDisposable = Disposer.newDisposable(project, "bridge-routers")
        BridgeRouters(bridgeDeps(project, wired.channel, wired.handlers, routersDisposable)).register()
        return wired
    }

    private fun sentFrames(): Map<String, SentFrame> = emptyMap()

    private fun keysReadByHandlers(): Map<String, Set<String>> = emptyMap()

    /** A scratch copy of the committed descriptor whose [method] lists [paramKeys] instead. */
    private fun descriptorWithParamKeys(method: String, vararg paramKeys: String): ProtocolDescriptor {
        val entries = JsonParser.parseString(ProtocolDescriptor.committedJson()).asJsonArray
        entries.map { it.asJsonObject }
            .single { it.get("method").asString == method }
            .add("paramKeys", JsonArray().apply { paramKeys.forEach(::add) })
        return ProtocolDescriptor.parse(entries.toString())
    }
}
