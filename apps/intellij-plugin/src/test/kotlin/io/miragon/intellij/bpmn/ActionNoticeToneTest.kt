package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ActionNoticeToneTest {
    @Test
    fun `knows exactly the tones the core gives an action notice`() {
        assertEquals(
            readTypeScriptStringArray("miragon.actionNoticeTypes", "ACTION_NOTICE_TONES"),
            ActionNoticeTone.entries.map { it.wireName },
        )
    }
}
