package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

class NewElementTemplatesTest {
    @ParameterizedTest
    @MethodSource("identityCases")
    fun `names a template after its file like the core`(case: IdentityCase) {
        assertEquals(NewElementTemplates.Identity(case.id, case.name), NewElementTemplates.identity(case.fileName))
    }

    @ParameterizedTest
    @MethodSource("templateCases")
    fun `writes the same bytes as the core`(case: TemplateCase) {
        assertEquals(case.text, NewElementTemplates.stub(case.engine, case.fileName))
    }

    @Test
    fun `offers the engines the core's prompt offers`() {
        val prompt = cases.getAsJsonObject("enginePrompt")

        assertEquals(prompt.get("placeholder").asString, NewElementTemplates.ENGINE_PLACEHOLDER)
        assertEquals(
            prompt.getAsJsonArray("items").map { it.asJsonObject.get("label").asString to it.asJsonObject.get("value").asString },
            TemplateEngine.values().map { it.label to it.id },
        )
    }

    class IdentityCase(val fileName: String, val id: String, val name: String)

    class TemplateCase(val engine: TemplateEngine, val fileName: String, val text: String)

    companion object {
        private val cases by lazy { readTypeScriptJson("miragon.newElementTemplateCases").asJsonObject }

        @JvmStatic
        fun identityCases(): List<Named<IdentityCase>> =
            cases.getAsJsonArray("identities").map { row ->
                val case = row.asJsonObject
                val fileName = case.get("fileName").asString
                Named.of(fileName, IdentityCase(fileName, case.get("id").asString, case.get("name").asString))
            }

        @JvmStatic
        fun templateCases(): List<Named<TemplateCase>> =
            cases.getAsJsonArray("templates").map { row ->
                val case = row.asJsonObject
                val engine = TemplateEngine.values().first { it.id == case.get("engine").asString }
                val fileName = case.get("fileName").asString
                Named.of("${engine.id} $fileName", TemplateCase(engine, fileName, case.get("text").asString))
            }
    }
}
