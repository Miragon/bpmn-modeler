package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.ElementIdReviewView
import io.miragon.intellij.bpmn.ElementIdReviewWindow
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import io.miragon.intellij.bpmn.readTypeScriptJson
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Covers how [ElementIdReviewRouter] hands the core's review to the tool
 * window and sends the window's actions back. `elementIdReview/show` is pinned
 * by key only in `protocol.json`; ElementIdReviewViewTest reads the view's
 * fields from the core's case file.
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

        override fun focus() {
            calls += "focus"
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

    private fun descriptorFrame(method: String) = SentFrame(method, descriptor.paramKeys(method))

    @Test
    fun `shows the core's view in the tool window`() {
        val routed = routed()
        val view = readTypeScriptJson("miragon.elementIdReviewViewCases").asJsonObject.getAsJsonObject("view")

        routed.wired.handlers.dispatch("elementIdReview/show", JsonObject().apply { add("view", view) }, null)

        assertEquals(listOf<Any>(ElementIdReviewView.from(view)), routed.window.calls)
    }

    @Test
    fun `brings the tool window up when the core asks`() {
        val routed = routed()

        routed.wired.handlers.dispatch("elementIdReview/focus", JsonObject(), null)

        assertEquals(listOf<Any>("focus"), routed.window.calls)
    }

    @Test
    fun `closes the tool window when the review is over`() {
        val routed = routed()

        routed.wired.handlers.dispatch("elementIdReview/close", JsonObject(), null)

        assertEquals(listOf<Any>("close"), routed.window.calls)
    }

    @Test
    fun `closes the tool window when the core stops`() {
        val routed = routed()

        routed.router.coreStopped()

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
