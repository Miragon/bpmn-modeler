package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.CoreSession
import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.TemplatePreferenceSnapshot
import io.miragon.intellij.bpmn.TemplateSwitch
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
 * Every host→core method the host can send is a [HostToCoreMethod], and those
 * equal the descriptor's host→core methods.
 *
 * It also pins the param and result keys. Each host→core sender runs once and
 * its frame must carry the keys the descriptor lists; each core→host handler
 * reads its params once and may read only the keys the descriptor lists; and
 * the result each core→host request is answered with must carry the keys the
 * descriptor lists.
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
    fun `can send exactly the host-to-core methods of the protocol descriptor`() {
        val sendable = HostToCoreMethod.entries.map { it.wireName }.toSet()

        assertEquals(emptySet<String>(), sendable - descriptor.hostToCoreMethods(), "host→core methods the core does not handle")
        assertEquals(emptySet<String>(), descriptor.hostToCoreMethods() - sendable, "host→core methods the host cannot send")
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
    fun `answers every core-to-host request with the descriptor's result keys`() {
        assertEquals(emptyList<String>(), descriptor.coreToHostResultDrift(resultKeysByMethod()))
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

    @Test
    fun `reports a core-to-host result key the descriptor renamed`() {
        val renamed = descriptorWithResultKeys("confirm/show", "accepted")

        assertEquals(
            listOf("confirm/show replies [confirmed], the descriptor lists [accepted]"),
            renamed.coreToHostResultDrift(resultKeysByMethod()),
        )
    }

    @Test
    fun `reports a core-to-host request no result answers`() {
        val added = descriptorWithResultKeys("secretStore/delete", "deleted")

        assertEquals(listOf("no result answers secretStore/delete"), added.coreToHostResultDrift(resultKeysByMethod()))
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
            linkedMapOf<HostToCoreMethod, BridgeRouters.() -> Unit>(
                HostToCoreMethod.SESSION_REGISTER to { editor.registerSession(session) },
                HostToCoreMethod.WEBVIEW_MESSAGE to { editor.forwardWebviewMessage(session, """{"type":"GetBpmnFileCommand"}""") },
                HostToCoreMethod.DOCUMENT_DID_CHANGE to { editor.notifyDocumentChanged(session) { "<definitions />" } },
                HostToCoreMethod.SESSION_SET_ACTIVE to { editor.setActiveEditor(session.editorId) },
                HostToCoreMethod.SETTINGS_DID_CHANGE to { editor.pushSettings() },
                HostToCoreMethod.SESSION_DISPOSE to { editor.disposeSession(session) },
                HostToCoreMethod.DIFF_OPEN to {
                    diff.openDiff("diff-1", "vcs", BEFORE_URI, "<before/>", {}, AFTER_URI, "<after/>", {})
                },
                HostToCoreMethod.DIFF_WEBVIEW_MESSAGE to { diff.forwardDiffMessage(BEFORE_URI, """{"type":"GetDiffCommand"}""") },
                HostToCoreMethod.DIFF_DISPOSE to { diff.disposeDiff("diff-1") },
                HostToCoreMethod.DEPLOYMENT_STATE_SEED to { deployment.sendSeed() },
                HostToCoreMethod.DEPLOYMENT_WEBVIEW_MESSAGE to { deployment.forwardDeploymentMessage("""{"type":"DeployCommand"}""") },
                HostToCoreMethod.DEPLOYMENT_OPEN to { deployment.setDeploymentOpen(true) },
                HostToCoreMethod.SCRIPT_DID_CHANGE to { script.notifyScriptChanged("script-1", "x") },
                HostToCoreMethod.SCRIPT_DID_CLOSE to { script.notifyScriptClosed("script-1") },
                HostToCoreMethod.SCRIPT_OPEN_ALL to { script.openAllScriptTasks() },
                HostToCoreMethod.SCRIPT_DID_OPEN_EXTERNAL to { script.notifyDidOpenExternal("/ws/.camunda/tmp/scripting/h/T/T.js") },
                HostToCoreMethod.MARKETPLACE_ADD to { marketplace.addMarketplace() },
                HostToCoreMethod.MARKETPLACE_UPDATE to { marketplace.updateMarketplaces() },
                HostToCoreMethod.MARKETPLACE_REMOVE to { marketplace.removeMarketplaces() },
                HostToCoreMethod.MODELER_CHANGE_ENGINE_VERSION to { modelerCommands.changeEngineVersion(session.editorId) },
                HostToCoreMethod.LINTING_TOGGLE to { modelerCommands.toggleLinting() },
                HostToCoreMethod.MIGRATION_MIGRATE_ALL to { modelerCommands.migrateAllDiagrams() },
                HostToCoreMethod.LAYOUT_FORMAT to { modelerCommands.formatDiagram() },
                HostToCoreMethod.LAYOUT_CLEANUP to { modelerCommands.cleanupDiagram() },
                HostToCoreMethod.DEPLOYMENT_SWITCH_TARGET to { modelerCommands.switchDeploymentTarget() },
                HostToCoreMethod.DEPLOYMENT_DEPLOY_FILES to { modelerCommands.deployFiles() },
                HostToCoreMethod.DEPLOYMENT_DEPLOY_ACTIVE to { modelerCommands.deployDiagram() },
                HostToCoreMethod.DEPLOYMENT_VERIFY to { modelerCommands.verifyDeployment() },
                HostToCoreMethod.DEPLOYMENT_STATUS_BAR_MENU to { modelerCommands.deploymentStatusMenu() },
                HostToCoreMethod.PLUGIN_APPROVALS_DID_CHANGE to { pluginApprovals.push(PluginApprovalStore.getInstance().snapshot()) },
                HostToCoreMethod.TEMPLATE_PREFERENCES_DID_CHANGE to { templatePreferences.push() },
                HostToCoreMethod.ADD_ONS_WEBVIEW_MESSAGE to { addOns.forwardMessage("""{"type":"GetAddOnCatalogCommand"}""") },
                HostToCoreMethod.ADD_ONS_OPEN to { addOns.setOpen(true) },
                HostToCoreMethod.ADD_ONS_REFRESH to { addOns.refresh() },
            )
        val framesBySentMethod = linkedMapOf<String, SentFrame>()
        for ((method, send) in senders) {
            routers.send()
            framesBySentMethod[method.wireName] = SentFrame.of(wired.fake.nextFrame())
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

    /**
     * Replies once with the result class each core→host request's handler
     * answers with, every optional key set, and returns the keys of each
     * reply's result by the request it answers.
     */
    private fun resultKeysByMethod(): Map<String, Set<String>> {
        val wired = wireChannel().also { this.wired = it }
        val resultsByMethod =
            linkedMapOf<String, RpcResult>(
                "document/write" to DocumentWriteResult(changed = true, accepted = true, normalizedContent = "<x/>"),
                "document/save" to DocumentSaveResult(saved = true),
                "picker/show" to PickerShowResult(selected = listOf(0)),
                "confirm/show" to ConfirmShowResult(confirmed = true),
                "clipboard/read" to ClipboardReadResult(text = "copied"),
                "secretStore/getBasicAuth" to BasicAuthCredentials(username = "demo", password = "secret"),
                "secretStore/getOAuth2" to OAuth2Credentials(clientId = "client", clientSecret = "secret"),
                "secretStore/getApprovedDestinations" to SecretApprovedDestinations(listOf("https://a.example")),
                "tokenStore/get" to TokenStoreGetResult(token = "ghp_stored"),
                "tokenPrompt/show" to TokenPromptShowResult(token = "ghp_typed"),
                "marketplacePrompt/show" to MarketplacePromptShowResult(location = "/work/t", scope = "project"),
                "actionNotice/show" to ActionNoticeShowResult(chosen = 0),
                "marketplaceState/read" to
                    MarketplaceStateReadResult(
                        registered = mapOf("project" to listOf("/work/t"), "allProjects" to emptyList()),
                        writable = listOf(WritableScope("project", SettingsPlace("file", listOf(".idea")))),
                    ),
                "pluginApprovals/change" to PluginApprovalsResult(listOf(PluginApproval("/ws/plugins/resize", "9f2c")), revision = 2),
                "pluginApprovals/read" to PluginApprovalsResult(listOf(PluginApproval("/ws/plugins/resize", "9f2c")), revision = 2),
                "templatePreferences/change" to TEMPLATE_PREFERENCES,
                "templatePreferences/read" to TEMPLATE_PREFERENCES,
                "addOns/reveal" to AddOnsRevealResult(shown = true),
            )
        return resultsByMethod.entries.withIndex().associate { (requestId, entry) ->
            wired.channel.reply(wired.requestId(requestId), entry.value)
            entry.key to replyResultKeys(wired.fake.nextFrame())
        }
    }

    /** A scratch copy of the committed descriptor whose [method] lists [paramKeys] instead. */
    private fun descriptorWithParamKeys(method: String, vararg paramKeys: String): ProtocolDescriptor =
        descriptorWithKeys(method, "paramKeys", paramKeys)

    /** A scratch copy of the committed descriptor whose [method] lists [resultKeys] as its result. */
    private fun descriptorWithResultKeys(method: String, vararg resultKeys: String): ProtocolDescriptor =
        descriptorWithKeys(method, "resultKeys", resultKeys)

    private fun descriptorWithKeys(method: String, field: String, keys: Array<out String>): ProtocolDescriptor {
        val entries = committedEntries()
        entries.map { it.asJsonObject }
            .single { it.get("method").asString == method }
            .add(field, JsonArray().apply { keys.forEach(::add) })
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
        val TEMPLATE_PREFERENCES =
            TemplatePreferencesResult(
                project = TemplatePreferenceSnapshot(listOf(TemplateSwitch("configFolder:shop/.camunda", "mail")), revision = 3),
                allProjects = TemplatePreferenceSnapshot(listOf(TemplateSwitch("marketplace:local:/opt/templates")), revision = 2),
            )
    }
}
