package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ScriptCompletionDetailTest {
    @Test
    fun `calls a variable without a type hint what the core calls it`() {
        assertEquals(coreUntypedDetail(), VariableInfo("total", origin = null, typeHint = null).detail)
    }

    @Test
    fun `names the type hint of a typed variable`() {
        assertEquals("SpinJsonNode", VariableInfo("order", origin = null, typeHint = "SpinJsonNode").detail)
    }

    /** The string `UNTYPED_PROCESS_VARIABLE_DETAIL` holds in `scriptCompletionDetail.ts`. */
    private fun coreUntypedDetail(): String {
        val source = readTypeScriptFile("miragon.scriptCompletionDetail")
        return requireNotNull(Regex("""export const UNTYPED_PROCESS_VARIABLE_DETAIL\b[^=]*=\s*"([^"]*)"""").find(source)) {
            "scriptCompletionDetail.ts declares no UNTYPED_PROCESS_VARIABLE_DETAIL string literal"
        }.groupValues[1]
    }
}
