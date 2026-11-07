package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ActionNoticeTone
import io.miragon.intellij.bpmn.HostNotifications
import io.miragon.intellij.bpmn.StatusAction
import io.miragon.intellij.bpmn.StatusIcon
import io.miragon.intellij.bpmn.StatusSlot
import io.miragon.intellij.bpmn.StatusSlots
import io.miragon.intellij.bpmn.StatusTone
import io.miragon.intellij.bpmn.StatusView
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Covers how [HostUiRouter] reads the core's status frames into one view per
 * slot and its log frames into IDE log lines. `statusBar/update` is pinned by
 * key only in `protocol.json`, so the nested view fields are checked here.
 */
@TestApplication
@ExtendWith(TestLoggerSetup::class)
class HostUiRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private class RecordingStatusSlots : StatusSlots {
        val views = linkedMapOf<StatusSlot, StatusView>()

        override fun show(slot: StatusSlot, view: StatusView) {
            views[slot] = view
        }

        override fun hide(slot: StatusSlot) {
            views.remove(slot)
        }
    }

    private fun routedSlots(): Pair<RpcHandlerRegistry, RecordingStatusSlots> {
        val wired = wireChannel().also { this.wired = it }
        val slots = RecordingStatusSlots()
        HostUiRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers), slots).register()
        return wired.handlers to slots
    }

    private class RecordingLogger : Logger() {
        val lines = mutableListOf<String>()

        override fun isDebugEnabled(): Boolean = true

        override fun debug(message: String?, t: Throwable?) {
            lines += "DEBUG $message"
        }

        override fun info(message: String?, t: Throwable?) {
            lines += "INFO $message"
        }

        override fun warn(message: String?, t: Throwable?) {
            lines += "WARN $message"
        }

        override fun error(message: String?, t: Throwable?, vararg details: String) {
            lines += "ERROR $message"
        }
    }

    private fun routedLog(): Pair<RpcHandlerRegistry, RecordingLogger> {
        val wired = wireChannel().also { this.wired = it }
        val project = projectFixture.get()
        val ideLog = RecordingLogger()
        val deps = bridgeDeps(project, wired.channel, wired.handlers, notifications = lazyOf(HostNotifications(project, ideLog)))
        HostUiRouter(deps, RecordingStatusSlots()).register()
        return wired.handlers to ideLog
    }

    private fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

    private class ShownNotice(val tone: ActionNoticeTone, val message: String, val labels: List<String>)

    /** A router whose notice is answered with [choice] the moment it is offered. */
    private fun routedNotice(choice: Int?): Triple<WiredBridge, RpcHandlerRegistry, MutableList<ShownNotice>> {
        val wired = wireChannel().also { this.wired = it }
        val shown = mutableListOf<ShownNotice>()
        HostUiRouter(
            bridgeDeps(projectFixture.get(), wired.channel, wired.handlers),
            RecordingStatusSlots(),
        ) { tone, message, labels, answer ->
            shown += ShownNotice(tone, message, labels)
            answer(choice)
            val expireNothing: () -> Unit = {}
            expireNothing
        }.register()
        return Triple(wired, wired.handlers, shown)
    }

    private class OpenNotice(val answer: (Int?) -> Unit) {
        @Volatile
        var expired = false
    }

    private class RoutedOpenNotices(val wired: WiredBridge, val router: HostUiRouter) {
        val offered = LinkedBlockingQueue<OpenNotice>()

        fun show(requestId: Int) = show(wired.requestId(requestId))

        fun show(requestId: CoreRequestId) =
            wired.handlers.dispatch(
                "actionNotice/show",
                JsonParser.parseString("""{"tone": "info", "message": "A new plugin", "labels": ["Review…"]}""").asJsonObject,
                requestId,
            )

        fun nextOffered(): OpenNotice = offered.poll(2, TimeUnit.SECONDS) ?: error("no notice was offered")
    }

    /** A router whose notices stay open until the test answers them. */
    private fun routedOpenNotices(): RoutedOpenNotices {
        val wired = wireChannel().also { this.wired = it }
        lateinit var routed: RoutedOpenNotices
        val router =
            HostUiRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers), RecordingStatusSlots()) { _, _, _, answer ->
                val notice = OpenNotice(answer)
                routed.offered += notice
                val expire: () -> Unit = { notice.expired = true }
                expire
            }
        routed = RoutedOpenNotices(wired, router)
        router.register()
        return routed
    }

    @Test
    fun `expires the open action notices once the bridge process goes down`() {
        val routed = routedOpenNotices()
        routed.show(requestId = 6)
        routed.show(requestId = 7)
        val notices = listOf(routed.nextOffered(), routed.nextOffered())

        routed.router.expireActionNotices()

        assertEquals(listOf(true, true), notices.map { it.expired })
    }

    @Test
    fun `leaves an answered action notice alone when the bridge process goes down`() {
        val routed = routedOpenNotices()
        routed.show(requestId = 8)
        val notice = routed.nextOffered()
        notice.answer(0)
        routed.wired.fake.nextFrame()

        routed.router.expireActionNotices()

        assertFalse(notice.expired)
    }

    @Test
    fun `offers no action notice for a request whose bridge process is already gone`() {
        val routed = routedOpenNotices()
        val currentRequest = routed.wired.requestId(9)

        routed.show(currentRequest.copy(generation = currentRequest.generation - 1))
        ApplicationManager.getApplication().invokeAndWait {}

        assertTrue(routed.offered.isEmpty(), "a click would answer a process that no longer listens")
    }

    @Test
    fun `answers an action notice with the index of the action the user chose`() {
        val (wired, handlers, shown) = routedNotice(choice = 1)

        handlers.dispatch(
            "actionNotice/show",
            json("""{"tone": "warning", "message": "A new plugin", "labels": ["Review…", "Not now"]}"""),
            wired.requestId(3),
        )

        assertEquals(json("""{"id": 3, "result": {"chosen": 1}}"""), json(wired.fake.nextFrame()))
        val notice = shown.single()
        assertEquals(ActionNoticeTone.WARNING, notice.tone)
        assertEquals("A new plugin", notice.message)
        assertEquals(listOf("Review…", "Not now"), notice.labels)
    }

    @Test
    fun `answers a dismissed action notice without a choice`() {
        val (wired, handlers, _) = routedNotice(choice = null)

        handlers.dispatch(
            "actionNotice/show",
            json("""{"tone": "info", "message": "A new plugin", "labels": ["Review…"]}"""),
            wired.requestId(4),
        )

        assertEquals(json("""{"id": 4, "result": {}}"""), json(wired.fake.nextFrame()))
    }

    @Test
    fun `shows an action notice of a tone this host does not know as information`() {
        val (wired, handlers, shown) = routedNotice(choice = 0)

        handlers.dispatch(
            "actionNotice/show",
            json("""{"tone": "celebration", "message": "A new plugin", "labels": ["Review…"]}"""),
            wired.requestId(5),
        )

        wired.fake.nextFrame()
        assertEquals(ActionNoticeTone.INFO, shown.single().tone)
    }

    @Test
    fun `writes a core log line to the IDE log without a webview label`() {
        val (handlers, ideLog) = routedLog()

        handlers.dispatch("notifier/log", json("""{"level": "warn", "message": "Failed to lint against .bpmnlintrc: boom"}"""), null)

        assertEquals(listOf("WARN Failed to lint against .bpmnlintrc: boom"), ideLog.lines)
    }

    @Test
    fun `writes a webview line with only the label the core gave it`() {
        val (handlers, ideLog) = routedLog()

        handlers.dispatch("notifier/log", json("""{"level": "info", "message": "[webview:order.bpmn] slow render"}"""), null)

        assertEquals(listOf("INFO [webview:order.bpmn] slow render"), ideLog.lines)
    }

    @Test
    fun `shows a status update in its slot`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch(
            "statusBar/update",
            json(
                """{"slot": "engineVersion", "view": {"text": "Camunda 7 (7.20)", "icon": "engine",
                    "tooltip": "Click to change engine version", "tone": "neutral",
                    "action": "changeEngineVersion", "transient": false}}""",
            ),
            null,
        )

        assertEquals(
            mapOf(
                StatusSlot.ENGINE_VERSION to
                    StatusView(
                        text = "Camunda 7 (7.20)",
                        icon = StatusIcon.ENGINE,
                        tooltip = "Click to change engine version",
                        tone = StatusTone.NEUTRAL,
                        action = StatusAction.CHANGE_ENGINE_VERSION,
                        transient = false,
                    ),
            ),
            slots.views,
        )
    }

    @Test
    fun `hides the slot of an update without a view`() {
        val (handlers, slots) = routedSlots()
        handlers.dispatch("statusBar/update", json("""{"slot": "bpmnlint", "view": {"text": "BPMNlint", "tone": "neutral"}}"""), null)

        handlers.dispatch("statusBar/update", json("""{"slot": "bpmnlint", "view": null}"""), null)

        assertEquals(emptyMap<StatusSlot, StatusView>(), slots.views)
    }

    @Test
    fun `ignores an update for a slot the host does not place`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch("statusBar/update", json("""{"slot": "gitBranch", "view": {"text": "main", "tone": "neutral"}}"""), null)

        assertEquals(emptyMap<StatusSlot, StatusView>(), slots.views)
    }

    @Test
    fun `reads missing optional view fields as their defaults`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch("statusBar/update", json("""{"slot": "bpmnlint", "view": {"text": "BPMNlint", "tone": "neutral"}}"""), null)

        assertEquals(mapOf(StatusSlot.BPMNLINT to StatusView(text = "BPMNlint")), slots.views)
    }

    @Test
    fun `shows a view without the icon, tone and action this host does not know`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch(
            "statusBar/update",
            json(
                """{"slot": "deploymentTarget", "view": {"text": "dev", "icon": "rocket", "tone": "loud",
                    "action": "launch", "transient": true}}""",
            ),
            null,
        )

        assertEquals(mapOf(StatusSlot.DEPLOYMENT_TARGET to StatusView(text = "dev", transient = true)), slots.views)
    }
}
