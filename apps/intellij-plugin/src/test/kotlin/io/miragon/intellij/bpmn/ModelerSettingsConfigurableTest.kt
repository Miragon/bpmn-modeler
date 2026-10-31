package io.miragon.intellij.bpmn

import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

@TestApplication
class ModelerSettingsConfigurableTest {
    @AfterEach
    fun resetPersistedSettings() {
        val appProperties = PropertiesComponent.getInstance()
        appProperties.unsetValue(LINTING_ENABLED_KEY)
        LIST_KEYS.forEach { appProperties.setList(it, null) }
    }

    @Test
    fun `saving the page keeps a lint choice made while it was open`() {
        val page = ModelerSettingsConfigurable()
        ModelerSettingsStore.getInstance().setLintingEnabled(false)

        page.apply()

        assertFalse(ModelerSettingsStore.getInstance().current().lintingEnabled)
    }

    private companion object {
        const val LINTING_ENABLED_KEY = "miragon.bpmnModeler.linting.enabled"
        val LIST_KEYS = listOf("miragon.bpmnModeler.favouriteBpmnElements", "miragon.bpmnModeler.marketplaces")
    }
}
