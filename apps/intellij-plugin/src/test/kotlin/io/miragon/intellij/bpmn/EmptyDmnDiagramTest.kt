package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class EmptyDmnDiagramTest {
    @Test
    fun `seeds a new DMN file with the core's scaffold byte for byte`() {
        assertEquals(coreEmptyDmnDiagram(), NewDmnModelAction.EMPTY_DMN_DIAGRAM)
    }

    /** The value of the `EMPTY_DMN_DIAGRAM` template literal in `emptyDmn.ts`. */
    private fun coreEmptyDmnDiagram(): String {
        val source = readTypeScriptFile("miragon.emptyDmn")
        val template =
            requireNotNull(Regex("""export const EMPTY_DMN_DIAGRAM\b[^=]*=\s*`([^`]*)`""").find(source)) {
                "emptyDmn.ts declares no EMPTY_DMN_DIAGRAM template literal"
            }.groupValues[1]
        // Line endings aside, the source text is the value only while the template holds no escape
        // and no placeholder.
        require('\\' !in template && "\${" !in template) {
            "EMPTY_DMN_DIAGRAM holds an escape or a placeholder; compare its value, not its source text"
        }
        // A template literal reads CRLF and CR as LF, so a CRLF checkout holds the same value.
        return template.replace("\r\n", "\n").replace('\r', '\n')
    }
}
