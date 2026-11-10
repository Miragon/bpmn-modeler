package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Test

@TestApplication
class ReviewAddOnsActionTest {
    @Test
    fun `registers Review Add-ons first in Tools with its text`() {
        runInEdtAndWait {
            val actions = ActionManager.getInstance()
            val review = actions.getAction(ReviewAddOnsAction.ID)
            val tools = actions.getAction("MiragonBpmn.Tools") as DefaultActionGroup

            assertInstanceOf(ReviewAddOnsAction::class.java, review)
            assertEquals("Review Add-ons", review.templatePresentation.text)
            assertEquals(ReviewAddOnsAction.ID, actions.getId(tools.getChildActionsOrStubs().first()))
        }
    }

    @Test
    fun `asks the core only once the tab shows`() {
        var reviewsWhenShown = 0
        var reviewsWhenNotShown = 0

        reviewAfterReveal({ onDone -> onDone(true) }) { reviewsWhenShown++ }
        reviewAfterReveal({ onDone -> onDone(false) }) { reviewsWhenNotShown++ }

        assertEquals(listOf(1, 0), listOf(reviewsWhenShown, reviewsWhenNotShown))
    }
}
