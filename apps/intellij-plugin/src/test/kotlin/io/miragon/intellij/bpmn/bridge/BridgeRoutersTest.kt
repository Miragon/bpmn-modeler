package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.ProjectTemplatePreferenceStore
import io.miragon.intellij.bpmn.TemplatePreferenceStore
import io.miragon.intellij.bpmn.TemplateSwitch
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class BridgeRoutersTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private var wired: WiredBridge? = null

    private var switchesStoredBefore: String? = null

    private lateinit var approvalsStoredBefore: List<PluginApproval>

    @BeforeEach
    fun rememberStores() {
        switchesStoredBefore = PropertiesComponent.getInstance().getValue(SWITCHES_KEY)
        approvalsStoredBefore = PluginApprovalStore.getInstance().read()
    }

    @AfterEach
    fun tearDown() {
        wired?.dispose()
        PropertiesComponent.getInstance().setValue(SWITCHES_KEY, switchesStoredBefore)
        PropertiesComponent.getInstance(projectFixture.get()).unsetValue(SWITCHES_KEY)
        PluginApprovalStore.getInstance().replaceAll(approvalsStoredBefore)
    }

    private fun parse(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    @Test
    fun `a spawn mirrors the switches and approvals another project stored while this bridge was still starting`() {
        val wired = wireChannel().also { this.wired = it }
        var alive = false
        val routers = BridgeRouters(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers, isProcessAlive = { alive }))
        routers.register()
        val appSwitches = TemplatePreferenceStore.getInstance()
        val projectSwitches = ProjectTemplatePreferenceStore.getInstance(projectFixture.get())

        // Changed after a queued register read the stores; their pushes find no live bridge.
        appSwitches.replaceAll(listOf(TemplateSwitch(ACME)))
        PluginApprovalStore.getInstance().replaceAll(listOf(PluginApproval(PLUGIN_ID, HASH)))
        routers.templatePreferences.push()
        routers.pluginApprovals.push(PluginApprovalStore.getInstance().snapshot())
        alive = true
        routers.seedAfterSpawn()

        val frames = wired.fake.framesUntilQuiet().map(::parse).associateBy { it.get("method").asString }
        val switches = frames.getValue("templatePreferences/didChange").getAsJsonObject("params")
        assertEquals(appSwitches.snapshot().revision, switches.getAsJsonObject("allProjects").get("revision").asLong)
        assertEquals(ACME, switches.getAsJsonObject("allProjects").getAsJsonArray("disabled")[0].asJsonObject.get("source").asString)
        assertEquals(projectSwitches.snapshot().revision, switches.getAsJsonObject("project").get("revision").asLong)
        val approvals = frames.getValue("pluginApprovals/didChange").getAsJsonObject("params")
        assertEquals(PluginApprovalStore.getInstance().snapshot().revision, approvals.get("revision").asLong)
        assertEquals(PLUGIN_ID, approvals.getAsJsonArray("approvals")[0].asJsonObject.get("pluginId").asString)
    }

    private companion object {
        const val SWITCHES_KEY = "miragon.bpmnModeler.templatePreferences"
        const val ACME = "marketplace:github:github.com/acme/templates"
        const val PLUGIN_ID = "/ws/.camunda/plugins/resize-tasks"
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
}
