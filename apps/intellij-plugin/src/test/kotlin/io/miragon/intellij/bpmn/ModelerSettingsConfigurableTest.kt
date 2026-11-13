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
import javax.swing.JLabel
import javax.swing.JList

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
    fun `follow-name checkbox applies and resets the persisted setting`() {
        withSettingsPage { page ->
            val component = page.createComponent()
            page.reset()
            val followName = UIUtil.findComponentsOfType(component, JCheckBox::class.java)
                .first { it.text == "IDs follow names" }

            followName.isSelected = true
            page.apply()

            assertEquals(true, ModelerSettingsStore.getInstance().current().elementIdsFollowName)
            ModelerSettingsStore.getInstance().update { it.copy(elementIdsFollowName = false) }
            page.reset()
            assertFalse(followName.isSelected)
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

    @Test
    fun `offers the default modes of the VS Code setting, labelled as it labels them, in its order`() {
        withSettingsPage { page ->
            assertEquals(manifestChoices("defaultMode"), labelledChoices(page.createComponent(), "Default mode:"))
        }
    }

    @Test
    fun `labels the default modes as the modeler's mode strip labels them`() {
        withSettingsPage { page ->
            assertEquals(modeStripLabels(), labelledChoices(page.createComponent(), "Default mode:").toMap())
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun labelledCombo(page: JComponent, label: String): JComboBox<String?> =
        UIUtil.findComponentsOfType(page, JLabel::class.java)
            .first { it.text == label }
            .labelFor as JComboBox<String?>

    /** Each value the box offers, with its label: the DSL renderer's accessible name is its cell text. */
    private fun labelledChoices(page: JComponent, label: String): List<Pair<String?, String?>> {
        val combo = labelledCombo(page, label)
        val list = JList<String?>()
        return (0 until combo.itemCount).map { index ->
            val value = combo.getItemAt(index)
            val cell = combo.renderer.getListCellRendererComponent(list, value, index, false, false)
            value to cell.accessibleContext.accessibleName
        }
    }

    /** `MODE_LABEL` in `modeStrip.ts`, the labels the modeler's mode strip shows. */
    private fun modeStripLabels(): Map<String, String> {
        val source = readTypeScriptFile("miragon.modeLabels")
        val entries =
            requireNotNull(Regex("""export const MODE_LABEL\b[^=]*=\s*\{([^}]*)}""").find(source)) {
                "modeStrip.ts declares no MODE_LABEL object literal"
            }.groupValues[1]
        return Regex(""""?(\w+)"?\s*:\s*"([^"]*)"""").findAll(entries)
            .associate { it.groupValues[1] to it.groupValues[2] }
    }

    /** `manifest.contract.spec.ts` holds these values to the core's: `SURFACE_MODES`. */
    private fun manifestChoices(section: String): List<Pair<String, String>> {
        val setting =
            readTypeScriptJson("miragon.vscodeManifest").asJsonObject
                .getAsJsonObject("contributes")
                .getAsJsonObject("configuration")
                .getAsJsonObject("properties")
                .getAsJsonObject("miragon.bpmnModeler.$section")
        val values = setting.getAsJsonArray("enum").map { it.asString }
        val labels = setting.getAsJsonArray("enumItemLabels").map { it.asString }
        return values.zip(labels)
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
        val SCALAR_KEYS =
            listOf(
                "miragon.bpmnModeler.linting.enabled",
                "miragon.bpmnModeler.language",
                "miragon.bpmnModeler.formPreview.automatic",
                "miragon.bpmnModeler.elementIds.followName",
            )
        val LIST_KEYS = listOf("miragon.bpmnModeler.favouriteBpmnElements", "miragon.bpmnModeler.marketplaces")
    }
}
