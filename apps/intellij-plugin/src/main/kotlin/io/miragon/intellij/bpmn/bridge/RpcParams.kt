package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject

/**
 * The top-level params of one core→host frame, read by key. A required read of
 * an absent, null or wrongly typed value throws, naming the key.
 */
internal interface RpcParams {
    fun string(key: String): String

    fun optionalString(key: String): String?

    fun optionalLong(key: String): Long?

    fun optionalBoolean(key: String): Boolean?

    fun jsonObject(key: String): JsonObject

    fun optionalJsonObject(key: String): JsonObject?

    fun jsonArray(key: String): JsonArray

    fun optionalJsonArray(key: String): JsonArray?

    /** The raw value, for a payload the host relays or decodes as a whole. */
    fun element(key: String): JsonElement?
}

internal class JsonRpcParams(private val params: JsonObject) : RpcParams {
    override fun string(key: String): String = optionalString(key) ?: missing(key)

    override fun optionalString(key: String): String? = present(key)?.asString

    override fun optionalLong(key: String): Long? = present(key)?.asLong

    override fun optionalBoolean(key: String): Boolean? = present(key)?.asBoolean

    override fun jsonObject(key: String): JsonObject = optionalJsonObject(key) ?: missing(key)

    override fun optionalJsonObject(key: String): JsonObject? = present(key)?.takeIf { it.isJsonObject }?.asJsonObject

    override fun jsonArray(key: String): JsonArray = optionalJsonArray(key) ?: missing(key)

    override fun optionalJsonArray(key: String): JsonArray? = present(key)?.takeIf { it.isJsonArray }?.asJsonArray

    override fun element(key: String): JsonElement? = params.get(key)

    private fun present(key: String): JsonElement? = params.get(key)?.takeUnless { it.isJsonNull }

    private fun missing(key: String): Nothing =
        throw IllegalArgumentException("Param '$key' is missing or not of the expected type")
}
