package io.miragon.intellij.bpmn

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

@TestApplication
class ModelerToolWindowTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    @Test
    fun `reports the Add-ons tab as not shown where the IDE cannot show the tool window`() {
        val shown = CompletableFuture<Boolean>()

        ApplicationManager.getApplication().invokeLater { revealAddOns(projectFixture.get(), shown::complete) }

        assertEquals(false, shown.get(5, TimeUnit.SECONDS))
    }
}
