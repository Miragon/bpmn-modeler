package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Pins the IntelliJ host to the bridge's committed protocol descriptor: every
 * core→host method has a Kotlin handler and every handler serves one of them.
 * A second handler for the same method already throws in [RpcHandlerRegistry.on],
 * so together the host has exactly one handler per core→host method.
 *
 * It also pins the param keys. Each host→core sender runs once and its frame
 * must carry the keys the descriptor lists; each core→host handler reads its
 * params once and may read only the keys the descriptor lists.
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
    fun `sends every host-to-core method with the descriptor's param keys`() {
        assertEquals(emptyList<String>(), descriptor.hostToCoreDrift(sentFrames()))
    }

    @Test
    fun `reads only the descriptor's param keys in every core-to-host handler`() {
        assertEquals(emptyList<String>(), descriptor.coreToHostReadDrift(keysReadByHandlers()))
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
    fun `reports a host-to-core method no sender drives`() {
        val added = descriptorWithHostToCoreMethod("layout/autoPlace")

        assertEquals(listOf("no sender drives layout/autoPlace"), added.hostToCoreDrift(sentFrames()))
    }

    @Test
    fun `reports a core-to-host key the descriptor renamed`() {
        val renamed = descriptorWithParamKeys("notifier/showInfo", "text")

        assertEquals(
            listOf("notifier/showInfo reads [message], the descriptor lists [text]"),
            renamed.coreToHostReadDrift(keysReadByHandlers()),
        )
    }

    private fun registeredMethods(): Set<String> = registeredRouters().first.handlers.registeredMethods()

    private fun registeredRouters(): Pair<WiredBridge, BridgeRouters> {
        val wired = wireChannel().also { this.wired = it }
        val project = projectFixture.get()
        // ScriptRouter subscribes to the project's message bus; tie that to the project.
        val routersDisposable = Disposer.newDisposable(project, "bridge-routers")
        val routers = BridgeRouters(bridgeDeps(project, wired.channel, wired.handlers, routersDisposable))
        routers.register()
        return wired to routers
    }

    /** Runs every host→core sender once, keyed by the method it must send. */
    private fun sentFrames(): Map<String, SentFrame> {
        val (wired, routers) = registeredRouters()
        val file = LightVirtualFile("process.bpmn", "<definitions/>")
        val session = CoreSession(file.url, file, projectFixture.get()) {}
        val senders =
            linkedMapOf<String, BridgeRouters.() -> Unit>(
                "session/register" to { editor.registerSession(session) },
                "webview/message" to { editor.forwardWebviewMessage(session, """{"type":"GetBpmnFileCommand"}""") },
                "document/didChange" to { editor.notifyDocumentChanged(session) { "<definitions />" } },
                "session/setActive" to { editor.setActiveEditor(session.editorId) },
                "settings/didChange" to { editor.pushSettings() },
                "session/dispose" to { editor.disposeSession(session) },
                "diff/open" to {
                    diff.openDiff("diff-1", "vcs", BEFORE_URI, "<before/>", {}, AFTER_URI, "<after/>", {})
                },
                "diff/webviewMessage" to { diff.forwardDiffMessage(BEFORE_URI, """{"type":"GetDiffCommand"}""") },
                "diff/dispose" to { diff.disposeDiff("diff-1") },
                "deploymentState/seed" to { deployment.sendSeed() },
                "deployment/webviewMessage" to { deployment.forwardDeploymentMessage("""{"type":"DeployCommand"}""") },
                "deployment/open" to { deployment.setDeploymentOpen(true) },
                "script/didChange" to { script.notifyScriptChanged("script-1", "x") },
                "script/didClose" to { script.notifyScriptClosed("script-1") },
                "script/openAll" to { script.openAllScriptTasks() },
                "script/didOpenExternal" to { script.notifyDidOpenExternal("/ws/.camunda/tmp/scripting/h/T/T.js") },
                "marketplace/add" to { marketplace.addMarketplace("https://github.com/owner/repo", appWide = false) },
                "marketplace/update" to { marketplace.updateMarketplaces() },
                "marketplace/remove" to { marketplace.removeMarketplaces(1) },
                "modeler/changeEngineVersion" to { modelerCommands.changeEngineVersion(session.editorId) },
                "linting/toggle" to { modelerCommands.toggleLinting() },
                "migration/migrateAll" to { modelerCommands.migrateAllDiagrams() },
                "layout/format" to { modelerCommands.formatDiagram() },
                "layout/cleanup" to { modelerCommands.cleanupDiagram() },
                "deployment/switchTarget" to { modelerCommands.switchDeploymentTarget() },
                "deployment/deployFiles" to { modelerCommands.deployFiles() },
                "deployment/deployActive" to { modelerCommands.deployDiagram() },
                "deployment/verify" to { modelerCommands.verifyDeployment() },
                "deployment/statusBarMenu" to { modelerCommands.deploymentStatusMenu() },
            )
        val framesBySentMethod = linkedMapOf<String, SentFrame>()
        for ((method, send) in senders) {
            routers.send()
            framesBySentMethod[method] = SentFrame.of(wired.fake.nextFrame())
        }
        return framesBySentMethod
    }

    /** Lets every registered core→host handler read its params, without running what it then does. */
    private fun keysReadByHandlers(): Map<String, Set<String>> {
        val handlers = registeredRouters().first.handlers
        return handlers.registeredMethods().associateWith { method ->
            KeyRecordingParams().also { requireNotNull(handlers.handler(method)).read(it) }.keysRead
        }
    }

    /** A scratch copy of the committed descriptor whose [method] lists [paramKeys] instead. */
    private fun descriptorWithParamKeys(method: String, vararg paramKeys: String): ProtocolDescriptor {
        val entries = committedEntries()
        entries.map { it.asJsonObject }
            .single { it.get("method").asString == method }
            .add("paramKeys", JsonArray().apply { paramKeys.forEach(::add) })
        return ProtocolDescriptor.parse(entries.toString())
    }

    /** A scratch copy of the committed descriptor with one more host→core notification. */
    private fun descriptorWithHostToCoreMethod(method: String): ProtocolDescriptor {
        val entries = committedEntries()
        entries.add(
            JsonObject().apply {
                addProperty("method", method)
                addProperty("direction", "hostToCore")
                addProperty("kind", "notification")
                add("paramKeys", JsonArray())
            },
        )
        return ProtocolDescriptor.parse(entries.toString())
    }

    private fun committedEntries(): JsonArray = JsonParser.parseString(ProtocolDescriptor.committedJson()).asJsonArray

    private companion object {
        const val BEFORE_URI = "file:///process.bpmn#diff-1-before"
        const val AFTER_URI = "file:///process.bpmn#diff-1-after"
    }
}
