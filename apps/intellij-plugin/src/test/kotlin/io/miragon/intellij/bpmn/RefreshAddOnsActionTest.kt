package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionPlaces
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RefreshAddOnsActionTest {
    @Test
    fun `shows the title button only on the Add-ons tab, and Find Action always`() {
        val shown =
            listOf(
                showsRefreshAddOns(ActionPlaces.TOOLWINDOW_TITLE) { true },
                showsRefreshAddOns(ActionPlaces.TOOLWINDOW_TITLE) { false },
                showsRefreshAddOns(ActionPlaces.ACTION_SEARCH) { false },
            )

        assertEquals(listOf(true, false, true), shown)
    }
}
