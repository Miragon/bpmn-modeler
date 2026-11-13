package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ElementIdReviewGroup
import io.miragon.intellij.bpmn.ElementIdReviewRow
import io.miragon.intellij.bpmn.ElementIdReviewView
import io.miragon.intellij.bpmn.ElementIdReviewWindow
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Covers how [ElementIdReviewRouter] reads the core's review into the tool
 * window and sends the window's actions back. `elementIdReview/show` is pinned
 * by key only in `protocol.json`, so the view's fields are checked here.
 */
@TestApplication
class ElementIdReviewRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val descriptor = ProtocolDescriptor.load()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private class RecordingWindow : ElementIdReviewWindow {
        val calls = mutableListOf<Any>()

        override fun show(view: ElementIdReviewView) {
            calls += view
        }

        override fun close() {
            calls += "close"
        }
    }

    private class Routed(val wired: WiredBridge, val router: ElementIdReviewRouter, val window: RecordingWindow)

    private fun routed(): Routed {
        val wired = wireChannel().also { this.wired = it }
        val window = RecordingWindow()
        val router = ElementIdReviewRouter(bridgeDeps(projectFixture.get(), wired.channel, wired.handlers), window)
        router.register()
        return Routed(wired, router, window)
    }

    private fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

    private fun descriptorFrame(method: String) = SentFrame(method, descriptor.paramKeys(method))

    @Test
    fun `shows the core's view in the tool window`() {
        val routed = routed()

        routed.wired.handlers.dispatch(
            "elementIdReview/show",
            json(
                """{"view": {"title": "order.bpmn", "message": "1 of 2 IDs will change.", "renameCount": 1,
                    "groups": [{"id": "activity", "label": "Activities", "checked": false, "collapsed": false,
                      "rows": [{"id": "Activity_1", "label": "Check stock", "description": "Activity_1 → serviceTask_checkStock",
                        "tooltip": "Check stock: Activity_1 becomes serviceTask_checkStock", "checked": true,
                        "revealId": "Activity_1"}]},
                      {"id": "matches", "label": "Already match", "collapsed": true,
                      "rows": [{"id": "flow_yes", "label": "yes", "description": "flow_yes",
                        "tooltip": "The ID already follows the name.", "revealId": "flow_yes"}]}]}}""",
            ),
            null,
        )

        assertEquals(
            listOf(
                ElementIdReviewView(
                    title = "order.bpmn",
                    message = "1 of 2 IDs will change.",
                    renameCount = 1,
                    groups =
                        listOf(
                            ElementIdReviewGroup(
                                "activity",
                                "Activities",
                                false,
                                false,
                                listOf(
                                    ElementIdReviewRow(
                                        "Activity_1",
                                        "Check stock",
                                        "Activity_1 → serviceTask_checkStock",
                                        "Check stock: Activity_1 becomes serviceTask_checkStock",
                                        true,
                                        "Activity_1",
                                    ),
                                ),
                            ),
                            ElementIdReviewGroup(
                                "matches",
                                "Already match",
                                null,
                                true,
                                listOf(ElementIdReviewRow("flow_yes", "yes", "flow_yes", "The ID already follows the name.", null, "flow_yes")),
                            ),
                        ),
                ),
            ),
            routed.window.calls,
        )
    }

    @Test
    fun `closes the tool window when the review is over`() {
        val routed = routed()

        routed.wired.handlers.dispatch("elementIdReview/close", JsonObject(), null)

        assertEquals(listOf<Any>("close"), routed.window.calls)
    }

    @Test
    fun `sends the window's checkboxes, selected rows, Apply and Discard with the descriptor's keys`() {
        val routed = routed()

        routed.router.setChecked(listOf("Activity_1"), false)
        routed.router.reveal("Activity_1")
        routed.router.apply()
        routed.router.discard()

        assertEquals(
            listOf(
                descriptorFrame("elementIdReview/setChecked"),
                descriptorFrame("elementIdReview/reveal"),
                descriptorFrame("elementIdReview/apply"),
                descriptorFrame("elementIdReview/discard"),
            ),
            routed.wired.fake.framesUntilQuiet().map(SentFrame::of),
        )
    }
}
