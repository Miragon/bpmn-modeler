package io.miragon.intellij.bpmn

import com.intellij.openapi.components.service
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.bridge.ReplicatedStateKind
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

@TestApplication
class ReplicatedStateFanOutTest {
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

    @Test
    fun `the states an application-level store feeds fan out to a running bridge`() {
        val project = withBridge.get().also { it.service<CoreProcess>() }
        val fannedOutByTheHost =
            listOf(ReplicatedStateKind.SETTINGS, ReplicatedStateKind.TEMPLATE_PREFERENCES, ReplicatedStateKind.PLUGIN_APPROVALS)

        fannedOutByTheHost.forEach { kind ->
            assertDoesNotThrow({ pushToRunningBridges(kind, listOf(project)) }, kind.name)
        }
    }

    @Test
    fun `a state mirrored only into its own project's bridge does not fan out`() {
        assertThrows(IllegalArgumentException::class.java) {
            pushToRunningBridges(ReplicatedStateKind.WORKSPACE_TRUST, emptyList())
        }
    }
}
