package io.miragon.intellij.bpmn.bridge

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import java.nio.file.Path

@ExtendWith(TestLoggerSetup::class)
class BridgeBinaryResolverTest {
    @AfterEach
    fun clearOverride() {
        System.clearProperty(BRIDGE_OVERRIDE_PROPERTY)
    }

    @Test
    fun `the dev override wins over the bundled binary`() {
        System.setProperty(BRIDGE_OVERRIDE_PROPERTY, "/opt/dev/modeler-bridge")

        assertEquals(Path.of("/opt/dev/modeler-bridge"), BridgeBinaryResolver().resolve())
    }

    private companion object {
        const val BRIDGE_OVERRIDE_PROPERTY = "miragon.bridge"
    }
}
