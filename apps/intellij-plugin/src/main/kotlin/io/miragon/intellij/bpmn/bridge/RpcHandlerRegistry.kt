package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject

/**
 * Handles one decoded core→host RPC frame, addressed by its `method` string.
 * [read] takes every param the frame carries before anything acts on them, so
 * the protocol coverage test can see the keys a handler reads without running
 * the action.
 */
internal fun interface RpcHandler {
    fun read(params: RpcParams): RpcAction
}

/** What one core→host frame asks the host to do; [id] is null for a notification. */
internal fun interface RpcAction {
    fun run(id: Int?)
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

    fun registeredMethods(): Set<String> = handlers.keys.toSet()

    fun handler(method: String): RpcHandler? = handlers[method]

    /** @return false when no handler is registered (caller logs the debug line). */
    fun dispatch(method: String, params: JsonObject, id: Int?): Boolean {
        val handler = handlers[method] ?: return false
        handler.read(JsonRpcParams(params)).run(id)
        return true
    }
}
