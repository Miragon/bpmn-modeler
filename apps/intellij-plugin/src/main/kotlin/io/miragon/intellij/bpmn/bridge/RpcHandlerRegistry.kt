package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject

/** Handles one decoded core→host RPC frame, addressed by its `method` string. */
internal fun interface RpcHandler {
    fun handle(params: JsonObject, id: Int?)
}

/**
 * String-keyed registry of core→host RPC handlers — the dispatch mechanism for
 * incoming methods.
 *
 * Handlers are registered via chainable [on] during `CoreProcess` construction,
 * which is single-threaded and strictly precedes the reader thread that calls
 * [dispatch], so the map is safely published without synchronisation (writes
 * happen-before the reader thread starts; the reader only reads). A duplicate
 * registration is a wiring bug, not a runtime condition, so it fails fast.
 */
internal class RpcHandlerRegistry {
    private val handlers = HashMap<String, RpcHandler>()

    fun on(method: String, handler: RpcHandler): RpcHandlerRegistry {
        require(handlers.put(method, handler) == null) { "Duplicate RPC handler for '$method'" }
        return this
    }

    /** @return false when no handler is registered (caller logs the debug line). */
    fun dispatch(method: String, params: JsonObject, id: Int?): Boolean {
        val handler = handlers[method] ?: return false
        handler.handle(params, id)
        return true
    }
}
