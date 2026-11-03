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
    const val LOG_ERROR = "LogErrorCommand"

    data class PageMessage(val type: String, val text: String?)

    /** What the preview does with a command of the page. An unknown one means the protocol moved on. */
    enum class PageRoute { SEND_FILE, LOG_WARNING, LOG_DEBUG, IGNORE, UNKNOWN }

    private val ROUTES =
        mapOf(
            GET_FILE to PageRoute.SEND_FILE,
            LOG_ERROR to PageRoute.LOG_WARNING,
            "LogWarningCommand" to PageRoute.LOG_WARNING,
            "LogInfoCommand" to PageRoute.LOG_DEBUG,
            "LogDebugCommand" to PageRoute.LOG_DEBUG,
            // The preview-only page has no builder, so it never edits or flushes.
            "SyncDocumentCommand" to PageRoute.IGNORE,
            "DocumentFlushedCommand" to PageRoute.IGNORE,
        )

    private val GSON = Gson()

    fun routeOf(type: String): PageRoute = ROUTES[type] ?: PageRoute.UNKNOWN

    fun fileQuery(content: String, locale: String): String =
        GSON.toJson(
            JsonObject().apply {
                addProperty("type", "ElementTemplateFileQuery")
                addProperty("content", content)
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
        return PageMessage(type, message.get("message")?.takeIf { it.isJsonPrimitive }?.asString)
    }
}
