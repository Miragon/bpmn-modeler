package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class ToggleAutomaticFormPreviewActionTest {
    @BeforeEach
    @AfterEach
    fun resetPersistedPreference() {
        PropertiesComponent.getInstance().unsetValue("miragon.bpmnModeler.formPreview.automatic")
    }

    @Test
    fun `registers the native action with its Find Action label`() {
        runInEdtAndWait {
            val action = assertInstanceOf(
                ToggleAutomaticFormPreviewAction::class.java,
                ActionManager.getInstance().getAction(ACTION_ID),
            )
            assertEquals("Toggle Automatic Form Preview", action.templatePresentation.text)
        }
    }

    @Test
    fun `toggles and persists automatic preview without an open editor`() {
        runInEdtAndWait {
            val action = ToggleAutomaticFormPreviewAction()
            val event = AnActionEvent.createFromAnAction(action, null, ActionPlaces.UNKNOWN, DataContext.EMPTY_CONTEXT)
            val store = ModelerSettingsStore.getInstance()
            assertTrue(store.current().formPreviewAutomatic)

            action.actionPerformed(event)

            assertFalse(store.current().formPreviewAutomatic)
            assertEquals("false", PropertiesComponent.getInstance().getValue("miragon.bpmnModeler.formPreview.automatic"))

            action.actionPerformed(event)

            assertTrue(store.current().formPreviewAutomatic)
        }
    }

    private companion object {
        const val ACTION_ID = "io.miragon.bpmn-modeler.toggleAutomaticFormPreview"
    }
}
