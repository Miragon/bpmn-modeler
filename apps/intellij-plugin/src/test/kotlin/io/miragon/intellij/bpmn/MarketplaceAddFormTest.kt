package io.miragon.intellij.bpmn

import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.testFramework.runInEdtAndWait
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.Component
import java.awt.Container
import javax.swing.JEditorPane
import javax.swing.JLabel
import javax.swing.JRadioButton
import javax.swing.text.JTextComponent

@TestApplication
class MarketplaceAddFormTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val thisProject = MarketplaceScopeChoice("project", "Register for this project", "Saved in .idea/workspace.xml")
    private val allProjects =
        MarketplaceScopeChoice(
            "allProjects",
            "Register for all my projects",
            "Saved in Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces",
        )
    private val refusal = "Enter a GitHub or GitLab repository URL, or a local folder path, holding a marketplace.json."

    private fun question(
        scopes: List<MarketplaceScopeChoice> = listOf(thisProject, allProjects),
        scope: String = "project",
        location: String = "",
        invalidLocation: String? = null,
    ) = MarketplaceAddQuestion(
        title = "Add Template Marketplace",
        prompt = "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
        placeholder = "https://github.com/owner/repo  or  ~/path/to/folder",
        location = location,
        invalidLocation = invalidLocation,
        scopes = scopes,
        scope = scope,
    )

    @Test
    fun `offers each scope as a radio button with the core's label and where it is saved`() {
        runInEdtAndWait {
            val panel = marketplaceAddPanel(question(), MarketplaceAddForm(question()))

            assertEquals(listOf(thisProject.label, allProjects.label), radioButtons(panel).map { it.text })
            assertTrue(shows(panel, thisProject.description), "the first scope's place must show")
            assertTrue(shows(panel, allProjects.description), "the second scope's place must show")
            assertTrue(shows(panel, question().prompt), "the prompt must show")
        }
    }

    @Test
    fun `selects the core's scope and answers the location and scope the user enters`() {
        runInEdtAndWait {
            val form = MarketplaceAddForm(question())
            val panel = marketplaceAddPanel(question(), form)
            assertEquals(listOf(true, false), radioButtons(panel).map { it.isSelected })

            locationField(panel).text = "https://github.com/acme/templates"
            radioButtons(panel)[1].isSelected = true
            panel.apply()

            assertEquals(MarketplaceAddAnswer("https://github.com/acme/templates", "allProjects"), form.answer())
        }
    }

    @Test
    fun `shows the refused entry, the scope the user chose and why the core refused it when it asks again`() {
        runInEdtAndWait {
            val again = question(scope = "allProjects", location = "acme", invalidLocation = refusal)
            val form = MarketplaceAddForm(again)
            val panel = marketplaceAddPanel(again, form)

            assertEquals("acme", locationField(panel).text)
            assertEquals(listOf(false, true), radioButtons(panel).map { it.isSelected })
            assertTrue(shows(panel, refusal), "the refusal must show in the form")
            panel.apply()
            assertEquals(MarketplaceAddAnswer("acme", "allProjects"), form.answer())
        }
    }

    @Test
    fun `shows no refusal on the first ask`() {
        runInEdtAndWait {
            assertFalse(shows(marketplaceAddPanel(question(), MarketplaceAddForm(question())), refusal))
        }
    }

    @Test
    fun `shows no scope choice when the core offers none and answers with its scope`() {
        runInEdtAndWait {
            val noChoice = question(scopes = emptyList(), scope = "allProjects")
            val form = MarketplaceAddForm(noChoice)
            val panel = marketplaceAddPanel(noChoice, form)

            locationField(panel).text = "/work/templates"
            panel.apply()

            assertEquals(emptyList<JRadioButton>(), radioButtons(panel))
            assertEquals(MarketplaceAddAnswer("/work/templates", "allProjects"), form.answer())
        }
    }

    @Test
    fun `builds the dialog with the core's title around the form`() {
        runInEdtAndWait {
            val dialog = AddMarketplaceDialog(projectFixture.get(), question(location = "acme", invalidLocation = refusal))
            try {
                assertEquals("Add Template Marketplace", dialog.title)
            } finally {
                dialog.close(DialogWrapper.CANCEL_EXIT_CODE)
            }
        }
    }

    private fun radioButtons(panel: DialogPanel): List<JRadioButton> = descendants(panel).filterIsInstance<JRadioButton>()

    private fun locationField(panel: DialogPanel): JTextComponent =
        descendants(panel).filterIsInstance<JTextComponent>().first { it !is JEditorPane }

    private fun shows(
        panel: DialogPanel,
        text: String,
    ): Boolean =
        descendants(panel).any { component ->
            component.isVisible &&
                when (component) {
                    is JEditorPane -> component.document.getText(0, component.document.length).contains(text)
                    is JLabel -> component.text.orEmpty().contains(text)
                    else -> false
                }
        }

    private fun descendants(root: Component): List<Component> =
        listOf(root) + (root as? Container)?.components.orEmpty().flatMap { descendants(it) }
}
