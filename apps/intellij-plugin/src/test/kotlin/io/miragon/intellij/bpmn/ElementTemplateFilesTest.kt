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
        assertEquals(case.isTemplate, ElementTemplateFiles.isTemplateFile(case.path, case.text, case.configFolder))
    }

    @ParameterizedTest
    @MethodSource("folderCases")
    fun `places the template folder like the TypeScript rule`(case: FolderCase) {
        assertEquals(case.folder, ElementTemplateFiles.folder(case.configFolder))
    }

    @Test
    fun `only scans the head so a large file stays cheap`() {
        val late = """{"icon":"${"x".repeat(10_000)}","${'$'}schema":"$C8_SCHEMA"}"""

        assertFalse(ElementTemplateFiles.isTemplateFile("/work/status.json", late, ".camunda"))
    }

    @Test
    fun `reads the schema from a file's content`() {
        assertTrue(ElementTemplateFiles.isTemplateFile(LightVirtualFile("status.json", """{"${'$'}schema":"$C8_SCHEMA"}""")))
        assertFalse(ElementTemplateFiles.isTemplateFile(LightVirtualFile("package.json", """{"name":"x"}""")))
    }

    /** Rows of `elementTemplateFile.cases.json` in `libs/modeler-types`. */
    class FileCase(val path: String, val configFolder: String, val text: String, val isTemplate: Boolean)

    class FolderCase(val configFolder: String, val folder: String)

    companion object {
        private const val C8_SCHEMA = "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json"

        private val cases by lazy { readTypeScriptJson("miragon.elementTemplateFileCases").asJsonObject }

        @JvmStatic
        fun fileCases(): List<Named<FileCase>> =
            cases.getAsJsonArray("files").map { row ->
                val case = row.asJsonObject
                Named.of(
                    case.get("name").asString,
                    FileCase(
                        case.get("path").asString,
                        case.get("configFolder").asString,
                        case.get("text").asString,
                        case.get("isTemplate").asBoolean,
                    ),
                )
            }

        @JvmStatic
        fun folderCases(): List<Named<FolderCase>> =
            cases.getAsJsonArray("folders").map { row ->
                val case = row.asJsonObject
                val configFolder = case.get("configFolder").asString
                Named.of(configFolder, FolderCase(configFolder, case.get("folder").asString))
            }
    }
}
