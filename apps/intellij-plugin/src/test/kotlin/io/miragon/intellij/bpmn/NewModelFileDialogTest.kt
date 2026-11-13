package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class NewModelFileDialogTest {
    @Test
    fun `titles and describes the New BPMN Model dialog as the core does`() {
        assertEquals(coreDialog("newBpmnModelFilePrompt"), NewBpmnModelAction.FILE_DIALOG)
    }

    @Test
    fun `titles and describes the New DMN Model dialog as the core does`() {
        assertEquals(coreDialog("newDmnModelFilePrompt"), NewDmnModelAction.FILE_DIALOG)
    }

    /** The title, description and extension the builder [name] in `newModelFilePrompt.ts` returns. */
    private fun coreDialog(name: String): NewModelFileDialog {
        val source = readTypeScriptFile("miragon.newModelFilePrompt")
        val body =
            requireNotNull(Regex("""export function $name\(\)[^{]*\{\s*return\s*\{([^}]*)}""").find(source)) {
                "newModelFilePrompt.ts declares no $name returning an object literal"
            }.groupValues[1]
        val fields = Regex("""(\w+)\s*:\s*"([^"]*)"""").findAll(body).associate { it.groupValues[1] to it.groupValues[2] }
        fun field(key: String) = requireNotNull(fields[key]) { "$name returns no string $key" }
        return NewModelFileDialog(field("title"), field("description"), field("extension"))
    }
}
