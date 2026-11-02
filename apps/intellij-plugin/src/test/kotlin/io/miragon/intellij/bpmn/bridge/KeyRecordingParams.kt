package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject

/** Answers every read with an empty value of the asked type and keeps the keys a handler asked for. */
internal class KeyRecordingParams : RpcParams {
    val keysRead = linkedSetOf<String>()

    override fun string(key: String): String = read(key, "")

    override fun optionalString(key: String): String? = read(key, "")

    override fun optionalLong(key: String): Long? = read(key, 0L)

    override fun boolean(key: String): Boolean = read(key, false)

    override fun optionalBoolean(key: String): Boolean? = read(key, false)

    override fun jsonObject(key: String): JsonObject = read(key, JsonObject())

    override fun optionalJsonObject(key: String): JsonObject? = read(key, JsonObject())

    override fun jsonArray(key: String): JsonArray = read(key, JsonArray())

    override fun optionalJsonArray(key: String): JsonArray? = read(key, JsonArray())

    override fun element(key: String): JsonElement? = read(key, JsonNull.INSTANCE)

    private fun <T> read(key: String, value: T): T {
        keysRead += key
        return value
    }
}
