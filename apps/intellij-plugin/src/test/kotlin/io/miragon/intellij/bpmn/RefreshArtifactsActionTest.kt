package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.ActionPlaces
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RefreshArtifactsActionTest {
    @Test
    fun `shows the title button only on the Artifacts tab, and Find Action always`() {
        val shown =
            listOf(
                showsRefreshArtifacts(ActionPlaces.TOOLWINDOW_TITLE) { true },
                showsRefreshArtifacts(ActionPlaces.TOOLWINDOW_TITLE) { false },
                showsRefreshArtifacts(ActionPlaces.ACTION_SEARCH) { false },
            )

        assertEquals(listOf(true, false, true), shown)
    }
}
