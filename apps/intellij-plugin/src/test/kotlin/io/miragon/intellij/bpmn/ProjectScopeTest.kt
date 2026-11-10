package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ProjectScopeTest {
    @Test
    fun `names the core's project scopes by their wire names, in its order`() {
        assertEquals(
            readTypeScriptStringArray("miragon.projectScopes", "PROJECT_SCOPES"),
            ProjectScope.entries.map { it.wireName },
        )
    }

    @Test
    fun `refuses a scope the core does not name`() {
        assertThrows(IllegalArgumentException::class.java) { ProjectScope.ofWireName("workspace") }
    }
}
