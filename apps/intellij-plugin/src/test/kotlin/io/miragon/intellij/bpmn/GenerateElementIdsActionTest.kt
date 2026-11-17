package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@TestApplication
class GenerateElementIdsActionTest {
    @Test
    fun `registers Generate IDs from Names in Tools with its text and no shortcut`() {
        runInEdtAndWait {
            val actions = ActionManager.getInstance()
            val action = actions.getAction(GenerateElementIdsAction.ID)
            val tools = actions.getAction("MiragonBpmn.Tools") as DefaultActionGroup

            assertInstanceOf(GenerateElementIdsAction::class.java, action)
            assertEquals("Generate IDs from Names", action.templatePresentation.text)
            assertTrue(tools.getChildActionsOrStubs().any { actions.getId(it) == GenerateElementIdsAction.ID })
            assertEquals(0, KeymapManager.getInstance().activeKeymap.getShortcuts(GenerateElementIdsAction.ID).size)
        }
    }
}
