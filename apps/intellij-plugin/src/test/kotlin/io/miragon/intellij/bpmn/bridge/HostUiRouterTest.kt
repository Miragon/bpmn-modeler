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

    @Test
    fun `shows the widget-shaped engine version in the engine slot`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch("statusBar/showEngineVersion", json("""{"platform": "c7", "version": "7.20"}"""), null)

        assertEquals(
            mapOf(
                StatusSlot.ENGINE_VERSION to
                    StatusView(
                        text = "Camunda 7 7.20",
                        tooltip = "Click to change engine version",
                        action = StatusAction.CHANGE_ENGINE_VERSION,
                    ),
            ),
            slots.views,
        )

        handlers.dispatch("statusBar/hideEngineVersion", json("{}"), null)

        assertEquals(emptyMap<StatusSlot, StatusView>(), slots.views)
    }

    @Test
    fun `shows the widget-shaped template load in the element templates slot`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch("statusBar/templatesLoading", json("{}"), null)
        assertEquals(
            mapOf(StatusSlot.ELEMENT_TEMPLATES to StatusView(text = "Loading element templates…", icon = StatusIcon.LOADING)),
            slots.views,
        )

        handlers.dispatch("statusBar/templatesReady", json("""{"count": 3}"""), null)
        assertEquals(
            mapOf(StatusSlot.ELEMENT_TEMPLATES to StatusView(text = "3 templates", transient = true)),
            slots.views,
        )

        handlers.dispatch("statusBar/templatesHide", json("{}"), null)
        assertEquals(emptyMap<StatusSlot, StatusView>(), slots.views)
    }

    @Test
    fun `shows the widget-shaped deployment target with its freshness as the tone`() {
        val (handlers, slots) = routedSlots()
        val tones =
            listOf("deployed", "changed", "superseded", "unknown").associateWith { freshness ->
                handlers.dispatch(
                    "statusBar/showDeploymentTarget",
                    json("""{"name": "dev", "freshness": "$freshness", "deployedAt": null, "verifiedAt": null}"""),
                    null,
                )
                slots.views[StatusSlot.DEPLOYMENT_TARGET]?.tone
            }

        assertEquals(
            mapOf(
                "deployed" to StatusTone.SUCCESS,
                "changed" to StatusTone.ATTENTION,
                "superseded" to StatusTone.INFO,
                "unknown" to StatusTone.NEUTRAL,
            ),
            tones,
        )
        assertEquals(
            StatusView(
                text = "dev",
                icon = StatusIcon.DOT,
                tooltip = "Never deployed to this target from this machine — click to switch target",
                tone = StatusTone.NEUTRAL,
                action = StatusAction.DEPLOYMENT_MENU,
            ),
            slots.views[StatusSlot.DEPLOYMENT_TARGET],
        )
    }

    @Test
    fun `names a missing deployment target and hides the slot on request`() {
        val (handlers, slots) = routedSlots()

        handlers.dispatch(
            "statusBar/showDeploymentTarget",
            json("""{"name": null, "freshness": "deployed", "deployedAt": null, "verifiedAt": null}"""),
            null,
        )
        assertEquals("No deployment target", slots.views[StatusSlot.DEPLOYMENT_TARGET]?.text)
        assertEquals("Deployed — matches the last deployment", slots.views[StatusSlot.DEPLOYMENT_TARGET]?.tooltip)

        handlers.dispatch("statusBar/hideDeploymentTarget", json("{}"), null)
        assertEquals(emptyMap<StatusSlot, StatusView>(), slots.views)
    }
}
