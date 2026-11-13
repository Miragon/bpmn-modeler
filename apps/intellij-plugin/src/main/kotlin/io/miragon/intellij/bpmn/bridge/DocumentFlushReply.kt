package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject

// The Kotlin twin of the flush reply table in libs/shared/src/lib/documentFlush.ts;
// DocumentFlushedReplyParseTest runs the rows of documentFlushReply.cases.json against it.

internal enum class FlushReplyStatus(val wire: String) {
    CLEAN("clean"),
    FLUSHED("flushed"),
    HOST_UPDATED("host-updated"),
    UNAVAILABLE("unavailable"),
    ;

    companion object {
        fun of(wire: String?): FlushReplyStatus = entries.firstOrNull { it.wire == wire } ?: UNAVAILABLE
    }
}

/** A page's `DocumentFlushedCommand` as the host acts on it; only a `FLUSHED` reply has content. */
internal data class FlushReply(
    val status: FlushReplyStatus,
    val content: String? = null,
    val documentRevision: Long? = null,
)

internal data class DocumentFlushedReply(val token: Long, val reply: FlushReply)

/** The newest sync the host saw the page post during a flush, or that posting it failed. */
internal sealed interface ObservedPageSync {
    data object Failed : ObservedPageSync

    data class Synced(val content: String, val documentRevision: Long) : ObservedPageSync
}

internal sealed interface FlushWriteDecision {
    data class WriteExport(val content: String, val documentRevision: Long?) : FlushWriteDecision

    data class WriteObservedSync(val content: String, val documentRevision: Long) : FlushWriteDecision

    data object AwaitSentSyncs : FlushWriteDecision

    data object KeepHostDocument : FlushWriteDecision

    data object SyncFailed : FlushWriteDecision

    data object Unavailable : FlushWriteDecision
}

/**
 * Parses a webview message as a `DocumentFlushedCommand`, or returns null if it
 * is not one, has no token, carries content that is not text, or is malformed.
 */
internal fun parseDocumentFlushedReply(raw: String, gson: Gson): DocumentFlushedReply? =
    try {
        val message = gson.fromJson(raw, JsonObject::class.java)
        val token = message?.get("token")?.takeIf { !it.isJsonNull }
        if (message?.get("type")?.asString != "DocumentFlushedCommand" || token == null) {
            null
        } else {
            parseFlushReply(message)?.let { DocumentFlushedReply(token.asLong, it) }
        }
    } catch (_: Exception) {
        null
    }

internal fun parseFlushReply(message: JsonObject): FlushReply? {
    val rawContent = message.get("content")?.takeIf { !it.isJsonNull }
    if (rawContent != null && !rawContent.isText()) return null
    val content = rawContent?.asString
    val rawStatus = message.get("status")?.takeIf { !it.isJsonNull }
    val status =
        when {
            rawStatus == null -> if (content == null) FlushReplyStatus.CLEAN else FlushReplyStatus.FLUSHED
            rawStatus.isText() -> FlushReplyStatus.of(rawStatus.asString)
            else -> FlushReplyStatus.UNAVAILABLE
        }
    val documentRevision =
        message.get("documentRevision")
            ?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isNumber }
            ?.asLong
    return when {
        status != FlushReplyStatus.FLUSHED -> FlushReply(status, documentRevision = documentRevision)
        content == null -> FlushReply(FlushReplyStatus.UNAVAILABLE, documentRevision = documentRevision)
        else -> FlushReply(status, content, documentRevision)
    }
}

internal fun decideFlushWrite(
    reply: FlushReply,
    observedSync: ObservedPageSync?,
    destructive: Boolean,
): FlushWriteDecision {
    if (reply.status == FlushReplyStatus.FLUSHED && reply.content != null) {
        return FlushWriteDecision.WriteExport(reply.content, reply.documentRevision)
    }
    return when {
        observedSync is ObservedPageSync.Failed -> FlushWriteDecision.SyncFailed
        reply.status == FlushReplyStatus.HOST_UPDATED -> FlushWriteDecision.KeepHostDocument
        observedSync !is ObservedPageSync.Synced ->
            if (reply.status == FlushReplyStatus.CLEAN) {
                FlushWriteDecision.AwaitSentSyncs
            } else {
                FlushWriteDecision.Unavailable
            }
        reply.status == FlushReplyStatus.CLEAN && destructive -> FlushWriteDecision.KeepHostDocument
        (reply.documentRevision ?: Long.MIN_VALUE) > observedSync.documentRevision ->
            FlushWriteDecision.KeepHostDocument
        else -> FlushWriteDecision.WriteObservedSync(observedSync.content, observedSync.documentRevision)
    }
}

private fun JsonElement.isText(): Boolean = isJsonPrimitive && asJsonPrimitive.isString
