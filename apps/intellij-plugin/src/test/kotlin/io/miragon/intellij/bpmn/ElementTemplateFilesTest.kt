package io.miragon.intellij.bpmn

import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

@TestApplication
class ElementTemplateFilesTest {
    @ParameterizedTest
    @MethodSource("fileCases")
    fun `tells template files apart like the TypeScript rule`(case: FileCase) {
        assertEquals(case.isTemplate, ElementTemplateFiles.isTemplateFile(case.path, case.text))
    }

    @Test
    fun `only scans the head so a large file stays cheap`() {
        val late = """{"icon":"${"x".repeat(10_000)}","${'$'}schema":"$C8_SCHEMA"}"""

        assertFalse(ElementTemplateFiles.isTemplateFile("/work/status.json", late))
    }

    @Test
    fun `reads the schema from a file's content`() {
        assertTrue(ElementTemplateFiles.isTemplateFile(LightVirtualFile("status.json", """{"${'$'}schema":"$C8_SCHEMA"}""")))
        assertFalse(ElementTemplateFiles.isTemplateFile(LightVirtualFile("package.json", """{"name":"x"}""")))
    }

    /** A row of `elementTemplateFile.cases.json` in `libs/modeler-types`. */
    class FileCase(val path: String, val text: String, val isTemplate: Boolean)

    companion object {
        private const val C8_SCHEMA = "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json"

        @JvmStatic
        fun fileCases(): List<Named<FileCase>> =
            readTypeScriptJson("miragon.elementTemplateFileCases").asJsonArray.map { row ->
                val case = row.asJsonObject
                Named.of(
                    case.get("name").asString,
                    FileCase(case.get("path").asString, case.get("text").asString, case.get("isTemplate").asBoolean),
                )
            }
    }
}
