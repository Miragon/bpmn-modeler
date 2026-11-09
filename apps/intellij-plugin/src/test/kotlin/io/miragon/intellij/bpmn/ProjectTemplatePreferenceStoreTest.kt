package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import com.intellij.ide.util.PropertiesComponent
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@TestApplication
class ProjectTemplatePreferenceStoreTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val projectProperties get() = PropertiesComponent.getInstance(projectFixture.get())

    private val appProperties get() = PropertiesComponent.getInstance()

    private val store get() = ProjectTemplatePreferenceStore.getInstance(projectFixture.get())

    private var appStoredBefore: String? = null

    @BeforeEach
    fun rememberStoredValues() {
        appStoredBefore = appProperties.getValue(KEY)
        appProperties.unsetValue(KEY)
        projectProperties.unsetValue(KEY)
    }

    @AfterEach
    fun restoreStoredValues() {
        appProperties.setValue(KEY, appStoredBefore)
        projectProperties.unsetValue(KEY)
    }

    @Test
    fun `keeps the open project's switches in the project's properties, apart from the application's`() {
        TemplatePreferenceStore.getInstance().replaceAll(listOf(TemplateSwitch(ACME)))

        store.change(TemplatePreferenceChange(ProjectScope.PROJECT, listOf(TemplateSwitch(SHOP, "mail")), emptyList()))

        assertEquals(
            JsonParser.parseString("""[{"source": "$SHOP", "templateId": "mail"}]"""),
            JsonParser.parseString(projectProperties.getValue(KEY)),
        )
        assertEquals(listOf(TemplateSwitch(SHOP, "mail")), store.snapshot().disabled)
        assertEquals(listOf(TemplateSwitch(ACME)), TemplatePreferenceStore.getInstance().snapshot().disabled)
    }

    @Test
    fun `merges into the switches the project stores and keeps one another writer stored`() {
        projectProperties.setValue(KEY, """[{"source": "$ACME"}]""")

        val outcome = store.change(TemplatePreferenceChange(ProjectScope.PROJECT, listOf(TemplateSwitch(SHOP)), emptyList()))

        assertEquals(listOf(TemplateSwitch(ACME), TemplateSwitch(SHOP)), outcome.snapshot.disabled)
    }

    @Test
    fun `grows its own revision, not the application's`() {
        val appRevision = TemplatePreferenceStore.getInstance().snapshot().revision
        val first = store.snapshot().revision

        val outcome = store.change(TemplatePreferenceChange(ProjectScope.PROJECT, listOf(TemplateSwitch(SHOP)), emptyList()))

        assertTrue(outcome.changed)
        assertTrue(outcome.snapshot.revision > first)
        assertEquals(appRevision, TemplatePreferenceStore.getInstance().snapshot().revision)
    }

    @Test
    fun `refuses a change of the other scope`() {
        assertThrows(IllegalArgumentException::class.java) {
            store.change(TemplatePreferenceChange(ProjectScope.ALL_PROJECTS, listOf(TemplateSwitch(SHOP)), emptyList()))
        }
        assertThrows(IllegalArgumentException::class.java) {
            TemplatePreferenceStore.getInstance().change(TemplatePreferenceChange(ProjectScope.PROJECT, listOf(TemplateSwitch(SHOP)), emptyList()))
        }
    }

    private companion object {
        const val KEY = "miragon.bpmnModeler.templatePreferences"
        const val SHOP = "configFolder:shop/.camunda"
        const val ACME = "marketplace:github:github.com/acme/templates"
    }
}
