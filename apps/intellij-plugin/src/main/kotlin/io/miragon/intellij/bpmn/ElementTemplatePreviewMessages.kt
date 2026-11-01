package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * The messages the template preview page exchanges with its host, shaped like the
 * `ElementTemplateFileQuery`, `LanguageQuery` and log commands in `libs/shared`.
 * The preview needs no bridge session, so IntelliJ answers the page itself.
 */
internal object ElementTemplatePreviewMessages {
    const val GET_FILE = "GetElementTemplateFileCommand"

    data class PageMessage(val type: String, val log: String?)

    private val GSON = Gson()

    fun fileQuery(content: String, locale: String): String =
        GSON.toJson(
            JsonObject().apply {
                addProperty("type", "ElementTemplateFileQuery")
                addProperty("content", content)
                addProperty("documentRevision", 0)
                addProperty("locale", locale)
            },
        )

    fun languageQuery(locale: String): String =
        GSON.toJson(
            JsonObject().apply {
                addProperty("type", "LanguageQuery")
                addProperty("locale", locale)
            },
        )

    fun parse(json: String): PageMessage? {
        val message = runCatching { JsonParser.parseString(json) }.getOrNull()?.takeIf { it.isJsonObject }?.asJsonObject
        val type = message?.get("type")?.takeIf { it.isJsonPrimitive }?.asString ?: return null
        return PageMessage(type, message.get("log")?.takeIf { it.isJsonPrimitive }?.asString)
    }
}
