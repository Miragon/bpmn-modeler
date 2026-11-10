package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.testFramework.junit5.TestApplication
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

@TestApplication
class SettingsBroadcastTest {
    private val withBridge = projectFixtureWithoutServicePreload()

    private val alsoWithBridge = projectFixtureWithoutServicePreload()

    private val withoutBridge = projectFixtureWithoutServicePreload()

    @Test
    fun `the fan-out reaches the bridge of every project that has one and creates none for the others`() {
        val bridges = listOf(withBridge.get().service<CoreProcess>(), alsoWithBridge.get().service<CoreProcess>())
        val untouched = withoutBridge.get()

        val running = runningBridges(listOf(withBridge.get(), untouched, alsoWithBridge.get()))

        assertEquals(bridges, running)
        assertNull(untouched.getServiceIfCreated(CoreProcess::class.java))
    }
}
