package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject

/**
 * The top-level params of one core→host frame, read by key. A required read of
 * an absent or null value throws, naming the key; a primitive of another JSON
 * type is coerced as Gson coerces it.
 */
internal interface RpcParams {
    fun string(key: String): String

    fun optionalString(key: String): String?

    fun optionalLong(key: String): Long?

    fun boolean(key: String): Boolean

    fun optionalBoolean(key: String): Boolean?

    fun jsonObject(key: String): JsonObject

    fun optionalJsonObject(key: String): JsonObject?

    fun jsonArray(key: String): JsonArray

    fun optionalJsonArray(key: String): JsonArray?

    /** The raw value, for a payload the host relays or decodes as a whole. */
    fun element(key: String): JsonElement?
}

/**
 * [RpcParams] over the frame's JSON. Once [seal]ed every read throws, so a
 * handler that reads in its [RpcAction] fails instead of hiding that key from
 * the protocol coverage test, which runs only [RpcHandler.read].
 */
internal class JsonRpcParams(private val params: JsonObject) : RpcParams {
    private var sealed = false

    fun seal() {
        sealed = true
    }

    override fun string(key: String): String = optionalString(key) ?: missing(key)

    override fun optionalString(key: String): String? = present(key)?.asString

    override fun optionalLong(key: String): Long? = present(key)?.asLong

    override fun boolean(key: String): Boolean = optionalBoolean(key) ?: missing(key)

    override fun optionalBoolean(key: String): Boolean? = present(key)?.asBoolean

    override fun jsonObject(key: String): JsonObject = optionalJsonObject(key) ?: missing(key)

    override fun optionalJsonObject(key: String): JsonObject? = present(key)?.takeIf { it.isJsonObject }?.asJsonObject

    override fun jsonArray(key: String): JsonArray = optionalJsonArray(key) ?: missing(key)

    override fun optionalJsonArray(key: String): JsonArray? = present(key)?.takeIf { it.isJsonArray }?.asJsonArray

    override fun element(key: String): JsonElement? = raw(key)

    private fun present(key: String): JsonElement? = raw(key)?.takeUnless { it.isJsonNull }

    private fun raw(key: String): JsonElement? {
        check(!sealed) { "Param '$key' read after the handler's read step" }
        return params.get(key)
    }

    private fun missing(key: String): Nothing =
        throw IllegalArgumentException("Param '$key' is missing or not of the expected type")
}
