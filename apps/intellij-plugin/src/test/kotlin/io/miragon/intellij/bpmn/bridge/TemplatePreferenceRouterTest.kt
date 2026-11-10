package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ProjectTemplatePreferenceStore
import io.miragon.intellij.bpmn.TemplatePreferenceStore
import io.miragon.intellij.bpmn.TemplateSwitch
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class TemplatePreferenceRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private var wired: WiredBridge? = null

    private var appStoredBefore: String? = null

    /** How often the router fanned an all-projects change out to every running bridge. */
    private var fanOuts = 0

    private val appStore get() = TemplatePreferenceStore.getInstance()

    private val projectStore get() = ProjectTemplatePreferenceStore.getInstance(projectFixture.get())

    @BeforeEach
    fun clearSwitches() {
        appStoredBefore = PropertiesComponent.getInstance().getValue(KEY)
        appStore.replaceAll(emptyList())
        projectStore.replaceAll(emptyList())
    }

    @AfterEach
    fun tearDown() {
        wired?.dispose()
        PropertiesComponent.getInstance().setValue(KEY, appStoredBefore)
        PropertiesComponent.getInstance(projectFixture.get()).unsetValue(KEY)
    }

    /** A router whose fan-out to every running bridge reaches this one's channel, as for the changing bridge itself. */
    private fun routedBridge(): WiredBridge {
        val wired = wireChannel().also { this.wired = it }
        lateinit var router: TemplatePreferenceRouter
        router =
            TemplatePreferenceRouter(
                bridgeDeps(projectFixture.get(), wired.channel, wired.handlers),
                pushToRunningBridges = {
                    fanOuts++
                    router.push()
                },
            )
        router.register()
        return wired
    }

    private fun parse(line: String): JsonObject = JsonParser.parseString(line).asJsonObject

    private fun WiredBridge.change(requestId: Int, scope: String, disable: String = "", enable: String = "") =
        handlers.dispatch(
            "templatePreferences/change",
            parse("""{"scope": "$scope", "disable": [$disable], "enable": [$enable]}"""),
            requestId(requestId),
        )

    private fun pair() =
        parse(
            """{
                "project": {"disabled": ${switchesJson(projectStore.snapshot().disabled)}, "revision": ${projectStore.snapshot().revision}},
                "allProjects": {"disabled": ${switchesJson(appStore.snapshot().disabled)}, "revision": ${appStore.snapshot().revision}}
            }""",
        )

    private fun switchesJson(switches: List<TemplateSwitch>): String =
        switches.joinToString(prefix = "[", postfix = "]") { switch ->
            switch.templateId?.let { """{"source": "${switch.source}", "templateId": "$it"}""" } ?: """{"source": "${switch.source}"}"""
        }

    @Test
    fun `a project change stores it in the project and pushes both lists to this bridge only, before it answers with them`() {
        val wired = routedBridge()
        appStore.replaceAll(listOf(TemplateSwitch(ACME)))
        val before = projectStore.snapshot().revision

        wired.change(5, "project", disable = MAIL_OFF)

        assertEquals(listOf(TemplateSwitch(SHOP, "mail")), projectStore.snapshot().disabled)
        assertEquals(listOf(TemplateSwitch(ACME)), appStore.snapshot().disabled)
        assertTrue(projectStore.snapshot().revision > before)
        val pushed = parse(wired.fake.nextFrame())
        assertEquals("templatePreferences/didChange", pushed.get("method").asString)
        assertEquals(pair(), pushed.getAsJsonObject("params"))
        val answer = parse(wired.fake.nextFrame())
        assertEquals(5, answer.get("id").asInt)
        assertFalse(answer.has("error"))
        assertEquals(pair(), answer.getAsJsonObject("result"))
        assertEquals(0, fanOuts)
    }

    @Test
    fun `an all-projects change stores it in the application and fans out to every running bridge before it answers`() {
        val wired = routedBridge()
        projectStore.replaceAll(listOf(TemplateSwitch(SHOP)))

        wired.change(6, "allProjects", disable = ACME_OFF)

        assertEquals(listOf(TemplateSwitch(ACME)), appStore.snapshot().disabled)
        assertEquals(listOf(TemplateSwitch(SHOP)), projectStore.snapshot().disabled)
        assertEquals(1, fanOuts)
        val pushed = parse(wired.fake.nextFrame())
        assertEquals("templatePreferences/didChange", pushed.get("method").asString)
        assertEquals(pair(), pushed.getAsJsonObject("params"))
        val answer = parse(wired.fake.nextFrame())
        assertEquals(6, answer.get("id").asInt)
        assertEquals(pair(), answer.getAsJsonObject("result"))
    }

    @Test
    fun `an enable drops exactly that switch and keeps one another writer stored`() {
        val wired = routedBridge()
        projectStore.replaceAll(listOf(TemplateSwitch(SHOP), TemplateSwitch(SHOP, "mail")))

        wired.change(7, "project", enable = SHOP_OFF)

        assertEquals(listOf(TemplateSwitch(SHOP, "mail")), projectStore.snapshot().disabled)
    }

    @Test
    fun `a change that keeps every switch bumps no revision, pushes nothing and still answers both lists`() {
        val wired = routedBridge()
        appStore.replaceAll(listOf(TemplateSwitch(ACME)))
        val revision = appStore.snapshot().revision

        wired.change(8, "allProjects", disable = ACME_OFF, enable = SHOP_OFF)

        val answer = parse(wired.fake.nextFrame())
        assertEquals(8, answer.get("id").asInt)
        assertEquals(pair(), answer.getAsJsonObject("result"))
        assertEquals(revision, appStore.snapshot().revision)
        assertEquals(0, fanOuts)
    }

    @Test
    fun `a read answers both lists with their revisions`() {
        val wired = routedBridge()
        appStore.replaceAll(listOf(TemplateSwitch(ACME)))
        projectStore.replaceAll(listOf(TemplateSwitch(SHOP, "mail")))

        wired.handlers.dispatch("templatePreferences/read", parse("{}"), wired.requestId(9))

        val answer = parse(wired.fake.nextFrame())
        assertEquals(9, answer.get("id").asInt)
        assertEquals(pair(), answer.getAsJsonObject("result"))
    }

    @Test
    fun `a change of a scope the core does not name answers an error and stores nothing`() {
        val wired = routedBridge()

        wired.fake.emit("""{"id": 10, "method": "templatePreferences/change", "params": {"scope": "workspace", "disable": [$SHOP_OFF], "enable": []}}""")

        val reply = parse(wired.fake.nextFrame())
        assertEquals(10, reply.get("id").asInt)
        assertTrue(reply.has("error"), reply.toString())
        assertEquals(emptyList<TemplateSwitch>(), projectStore.snapshot().disabled)
        assertEquals(emptyList<TemplateSwitch>(), appStore.snapshot().disabled)
    }

    @Test
    fun `a change with a row that is no switch answers an error and stores nothing`() {
        val wired = routedBridge()

        wired.fake.emit("""{"id": 11, "method": "templatePreferences/change", "params": {"scope": "project", "disable": [{"templateId": "mail"}], "enable": []}}""")

        val reply = parse(wired.fake.nextFrame())
        assertEquals(11, reply.get("id").asInt)
        assertTrue(reply.has("error"), reply.toString())
        assertEquals(emptyList<TemplateSwitch>(), projectStore.snapshot().disabled)
    }

    @Test
    fun `a change that both disables and enables one switch answers an error and stores nothing`() {
        val wired = routedBridge()
        projectStore.replaceAll(listOf(TemplateSwitch(ACME)))

        wired.fake.emit("""{"id": 12, "method": "templatePreferences/change", "params": {"scope": "project", "disable": [$MAIL_OFF], "enable": [$MAIL_OFF]}}""")

        val reply = parse(wired.fake.nextFrame())
        assertEquals(12, reply.get("id").asInt)
        assertTrue(reply.get("error").asString.contains("names a switch twice"), reply.toString())
        assertEquals(listOf(TemplateSwitch(ACME)), projectStore.snapshot().disabled)
    }

    private companion object {
        const val KEY = "miragon.bpmnModeler.templatePreferences"
        const val SHOP = "configFolder:shop/.camunda"
        const val ACME = "marketplace:github:github.com/acme/templates"
        const val SHOP_OFF = """{"source": "$SHOP"}"""
        const val MAIL_OFF = """{"source": "$SHOP", "templateId": "mail"}"""
        const val ACME_OFF = """{"source": "$ACME"}"""
    }
}
