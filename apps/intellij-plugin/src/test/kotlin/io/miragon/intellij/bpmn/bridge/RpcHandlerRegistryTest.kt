package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class RpcHandlerRegistryTest {
    private val frameParams = JsonObject().apply { addProperty("message", "Saved") }

    @Test
    fun `runs the action with the params its handler read`() {
        val shown = mutableListOf<String>()
        val handlers =
            RpcHandlerRegistry().on("notifier/showInfo") { params ->
                val message = params.string("message")
                RpcAction { shown += message }
            }

        handlers.dispatch("notifier/showInfo", frameParams, null)

        assertEquals(listOf("Saved"), shown)
    }

    @Test
    fun `fails a handler that reads its params while its action runs`() {
        val handlers =
            RpcHandlerRegistry().on("notifier/showInfo") { params ->
                RpcAction { params.string("message") }
            }

        val failure =
            assertThrows(IllegalStateException::class.java) {
                handlers.dispatch("notifier/showInfo", frameParams, null)
            }

        assertEquals("Param 'message' read after the handler's read step", failure.message)
    }
}
