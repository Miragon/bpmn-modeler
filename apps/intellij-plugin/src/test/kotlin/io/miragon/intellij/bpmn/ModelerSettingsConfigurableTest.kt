package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.ui.UIUtil
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import javax.swing.JComboBox
import javax.swing.JCheckBox
import javax.swing.JComponent

@TestApplication
class ModelerSettingsConfigurableTest {
    @Test
    fun `registers automatic preview with its native action and label`() {
        val xml = requireNotNull(javaClass.getResource("/META-INF/plugin.xml")).readText()
        assertTrue(xml.contains("id=\"io.miragon.bpmn-modeler.toggleAutomaticFormPreview\""))
        assertTrue(xml.contains("class=\"io.miragon.intellij.bpmn.ToggleAutomaticFormPreviewAction\""))
        assertTrue(xml.contains("text=\"Toggle Automatic Form Preview\""))
    }

    @BeforeEach
    @AfterEach
    fun resetPersistedSettings() {
        val appProperties = PropertiesComponent.getInstance()
        SCALAR_KEYS.forEach { appProperties.unsetValue(it) }
        LIST_KEYS.forEach { appProperties.setList(it, null) }
    }

    @Test
    fun `saving the page keeps a lint choice made while it was open`() {
        val page = ModelerSettingsConfigurable()
        ModelerSettingsStore.getInstance().setLintingEnabled(false)

        page.apply()

        assertFalse(ModelerSettingsStore.getInstance().current().lintingEnabled)
    }

    @Test
    fun `the automatic preview action persists without an open editor and Apply keeps it`() {
        runInEdtAndWait {
            val page = ModelerSettingsConfigurable()
            page.createComponent()
            page.reset()
            val action = ToggleAutomaticFormPreviewAction()
            val event = AnActionEvent.createFromAnAction(action, null, ActionPlaces.UNKNOWN, DataContext.EMPTY_CONTEXT)
            action.actionPerformed(event)
            page.apply()
            assertFalse(ModelerSettingsStore.getInstance().current().formPreviewAutomatic)
            action.actionPerformed(event)
            assertEquals(true, ModelerSettingsStore.getInstance().current().formPreviewAutomatic)
            page.disposeUIResources()
        }
    }

    @Test
    fun `automatic preview checkbox applies and resets the persisted preference`() {
        runInEdtAndWait {
            val page = ModelerSettingsConfigurable()
            val component = page.createComponent()
            page.reset()
            val checkbox = UIUtil.findComponentsOfType(component, JCheckBox::class.java)
                .first { it.text == "Automatically preview linked forms" }
            checkbox.isSelected = false
            page.apply()
            assertFalse(ModelerSettingsStore.getInstance().current().formPreviewAutomatic)
            ModelerSettingsStore.getInstance().update { it.copy(formPreviewAutomatic = true) }
            page.reset()
            assertEquals(true, checkbox.isSelected)
            page.disposeUIResources()
        }
    }

    @Test
    fun `keeps an app-wide marketplace added after reset when Apply changes another setting`() {
        runInEdtAndWait {
            val page = ModelerSettingsConfigurable()
            val component = page.createComponent()
            page.reset()
            ModelerSettingsStore.getInstance().addMarketplace(ADDED_MEANWHILE)

            languageCombo(component).selectedItem = "de"
            page.apply()

            val stored = ModelerSettingsStore.getInstance().current()
            assertEquals("de", stored.language)
            assertEquals(listOf(ADDED_MEANWHILE), stored.marketplaces)
            page.disposeUIResources()
        }
    }

    @Test
    fun `a second Apply keeps a marketplace the first Apply merged in`() {
        runInEdtAndWait {
            val page = ModelerSettingsConfigurable()
            val component = page.createComponent()
            page.reset()
            ModelerSettingsStore.getInstance().addMarketplace(ADDED_MEANWHILE)
            languageCombo(component).selectedItem = "de"
            page.apply()

            languageCombo(component).selectedItem = "fr"
            page.apply()

            val stored = ModelerSettingsStore.getInstance().current()
            assertEquals("fr", stored.language)
            assertEquals(listOf(ADDED_MEANWHILE), stored.marketplaces)
            page.disposeUIResources()
        }
    }

    private fun languageCombo(page: JComponent): JComboBox<*> =
        UIUtil.findComponentsOfType(page, JComboBox::class.java)
            .first { combo -> (0 until combo.itemCount).any { combo.getItemAt(it) == "de" } }

    private companion object {
        const val ADDED_MEANWHILE = "https://github.com/acme/templates"
        val SCALAR_KEYS = listOf("miragon.bpmnModeler.linting.enabled", "miragon.bpmnModeler.language", "miragon.bpmnModeler.formPreview.automatic")
        val LIST_KEYS = listOf("miragon.bpmnModeler.favouriteBpmnElements", "miragon.bpmnModeler.marketplaces")
    }
}
