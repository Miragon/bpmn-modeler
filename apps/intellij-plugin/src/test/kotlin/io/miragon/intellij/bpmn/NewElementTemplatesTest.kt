package io.miragon.intellij.bpmn

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
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
    fun `scaffolds the same template as the core`(case: TemplateCase) {
        assertEquals(case.template, JsonParser.parseString(NewElementTemplates.stub(case.engine, case.fileName)))
    }

    @Test
    fun `writes the file the way the core does`() {
        val text = NewElementTemplates.stub(TemplateEngine.C8, "send-mail.json")

        assertEquals(PRETTY.toJson(JsonParser.parseString(text)) + "\n", text)
    }

    class IdentityCase(val fileName: String, val id: String, val name: String)

    class TemplateCase(val engine: TemplateEngine, val fileName: String, val template: JsonObject)

    companion object {
        private val PRETTY = GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create()

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
                Named.of(
                    engine.id,
                    TemplateCase(engine, case.get("fileName").asString, case.getAsJsonObject("template")),
                )
            }
    }
}
