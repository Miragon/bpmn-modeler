package io.miragon.intellij.bpmn

import com.google.gson.Gson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Reads the view of `elementIdReviewView.cases.json`, which the core's spec pins to `elementIdReviewView`. */
class ElementIdReviewViewTest {
    private val view = readTypeScriptJson("miragon.elementIdReviewViewCases").asJsonObject.getAsJsonObject("view")

    @Test
    fun `reads every field of the core's view`() {
        // Gson writes the data classes back under their property names and leaves out null checkboxes,
        // so a field the core renamed reads as empty here and fails the comparison.
        assertEquals(view, Gson().toJsonTree(ElementIdReviewView.from(view)))
    }
}
