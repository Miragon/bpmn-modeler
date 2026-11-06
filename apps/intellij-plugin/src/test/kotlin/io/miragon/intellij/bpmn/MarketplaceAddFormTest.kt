package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MarketplaceAddFormTest {
    private val thisProject = MarketplaceScopeChoice("project", "Register for this project", "Saved in .idea/workspace.xml")
    private val allProjects = MarketplaceScopeChoice("allProjects", "Register for all my projects", "Saved in Settings")

    private fun question(
        scopes: List<MarketplaceScopeChoice> = listOf(thisProject, allProjects),
        scope: String = "project",
        location: String = "",
    ) = MarketplaceAddQuestion(
        title = "Add Template Marketplace",
        prompt = "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
        placeholder = "https://github.com/owner/repo",
        location = location,
        invalidLocation = null,
        scopes = scopes,
        scope = scope,
    )

    @Test
    fun `offers the second of two scopes as an unchecked checkbox and answers the first`() {
        val form = MarketplaceAddForm(question())
        form.location = "https://github.com/acme/templates"

        assertEquals(allProjects, form.scopeCheckbox)
        assertFalse(form.scopeChecked)
        assertEquals(MarketplaceAddAnswer("https://github.com/acme/templates", "project"), form.answer())
    }

    @Test
    fun `answers the second scope when its checkbox is checked`() {
        val form = MarketplaceAddForm(question())
        form.scopeChecked = true

        assertEquals("allProjects", form.answer().scope)
    }

    @Test
    fun `shows the refused entry and the scope the user chose when the core asks again`() {
        val form = MarketplaceAddForm(question(scope = "allProjects", location = "acme"))

        assertEquals("acme", form.location)
        assertTrue(form.scopeChecked)
        assertEquals(MarketplaceAddAnswer("acme", "allProjects"), form.answer())
    }

    @Test
    fun `shows no checkbox when the core offers no choice and answers with its scope`() {
        val form = MarketplaceAddForm(question(scopes = emptyList(), scope = "allProjects"))
        form.location = "/work/templates"

        assertNull(form.scopeCheckbox)
        assertEquals(MarketplaceAddAnswer("/work/templates", "allProjects"), form.answer())
    }
}
