package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.StatusAction
import io.miragon.intellij.bpmn.StatusIcon
import io.miragon.intellij.bpmn.StatusSlot
import io.miragon.intellij.bpmn.StatusSlots
import io.miragon.intellij.bpmn.StatusTone
import io.miragon.intellij.bpmn.StatusView
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith

/**
 * Covers how [HostUiRouter] reads the core's status frames into one view per
 * slot. `statusBar/update` is pinned by key only in `protocol.json`, so the
 * nested view fields are checked here.
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

    private fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

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
