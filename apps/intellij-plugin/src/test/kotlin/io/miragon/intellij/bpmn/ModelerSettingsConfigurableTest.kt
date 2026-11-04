package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.ui.UIUtil
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import javax.swing.JComboBox
import javax.swing.JCheckBox
import javax.swing.JComponent

@TestApplication
class ModelerSettingsConfigurableTest {
    @BeforeEach
    @AfterEach
    fun resetPersistedSettings() {
        val appProperties = PropertiesComponent.getInstance()
        SCALAR_KEYS.forEach { appProperties.unsetValue(it) }
        LIST_KEYS.forEach { appProperties.setList(it, null) }
    }

    @Test
    fun `saving the page keeps a lint choice made while it was open`() {
        withSettingsPage { page ->
            ModelerSettingsStore.getInstance().setLintingEnabled(false)

            page.apply()

            assertFalse(ModelerSettingsStore.getInstance().current().lintingEnabled)
        }
    }

    @Test
    fun `Apply keeps an automatic preview preference changed while the page was open`() {
        withSettingsPage { page ->
            page.createComponent()
            page.reset()
            ModelerSettingsStore.getInstance().update { it.copy(formPreviewAutomatic = false) }

            page.apply()

            assertFalse(ModelerSettingsStore.getInstance().current().formPreviewAutomatic)
        }
    }

    @Test
    fun `automatic preview checkbox applies and resets the persisted preference`() {
        withSettingsPage { page ->
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
        }
    }

    @Test
    fun `keeps an app-wide marketplace added after reset when Apply changes another setting`() {
        withSettingsPage { page ->
            val component = page.createComponent()
            page.reset()
            ModelerSettingsStore.getInstance().addMarketplace(ADDED_MEANWHILE)

            languageCombo(component).selectedItem = "de"
            page.apply()

            val stored = ModelerSettingsStore.getInstance().current()
            assertEquals("de", stored.language)
            assertEquals(listOf(ADDED_MEANWHILE), stored.marketplaces)
        }
    }

    @Test
    fun `a second Apply keeps a marketplace the first Apply merged in`() {
        withSettingsPage { page ->
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
        }
    }

    private fun languageCombo(page: JComponent): JComboBox<*> =
        UIUtil.findComponentsOfType(page, JComboBox::class.java)
            .first { combo -> (0 until combo.itemCount).any { combo.getItemAt(it) == "de" } }

    private fun withSettingsPage(test: (ModelerSettingsConfigurable) -> Unit) {
        runInEdtAndWait {
            val page = ModelerSettingsConfigurable()
            try {
                test(page)
            } finally {
                page.disposeUIResources()
            }
        }
    }

    private companion object {
        const val ADDED_MEANWHILE = "https://github.com/acme/templates"
        val SCALAR_KEYS = listOf("miragon.bpmnModeler.linting.enabled", "miragon.bpmnModeler.language", "miragon.bpmnModeler.formPreview.automatic")
        val LIST_KEYS = listOf("miragon.bpmnModeler.favouriteBpmnElements", "miragon.bpmnModeler.marketplaces")
    }
}
