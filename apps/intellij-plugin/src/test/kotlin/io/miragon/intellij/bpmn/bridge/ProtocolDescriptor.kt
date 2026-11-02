package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import java.nio.file.Files
import java.nio.file.Path

/** The method and top-level param keys of one host→core frame a Kotlin sender wrote. */
internal data class SentFrame(val method: String, val paramKeys: Set<String>) {
    companion object {
        fun of(line: String): SentFrame {
            val frame = JsonParser.parseString(line).asJsonObject
            return SentFrame(frame.get("method").asString, frame.getAsJsonObject("params").keySet().toSet())
        }
    }
}

/** The top-level keys of the result in one reply frame the host wrote. */
internal fun replyResultKeys(line: String): Set<String> =
    JsonParser.parseString(line).asJsonObject.getAsJsonObject("result").keySet().toSet()

/**
 * The bridge's committed protocol descriptor (`protocol.json`) and the checks
 * that hold the Kotlin host to it. Each check returns one line per mismatch, so
 * an empty list means the host agrees with the descriptor.
 */
internal class ProtocolDescriptor private constructor(
    private val methods: Map<String, DescriptorMethod>,
) {
    /** [resultKeys] is null for a method without a result. */
    private class DescriptorMethod(val direction: String, val paramKeys: Set<String>, val resultKeys: Set<String>?)

    fun hostToCoreMethods(): Set<String> = methodsIn(HOST_TO_CORE)

    fun coreToHostMethods(): Set<String> = methodsIn(CORE_TO_HOST)

    fun paramKeys(method: String): Set<String> =
        requireNotNull(methods[method]) { "$method is not in the protocol descriptor" }.paramKeys

    /**
     * Compares the frames the Kotlin senders wrote, keyed by the method each
     * sender must write, with the descriptor's host→core methods and keys.
     */
    fun hostToCoreDrift(framesBySentMethod: Map<String, SentFrame>): List<String> {
        val hostToCore = hostToCoreMethods()
        val frameDrift =
            framesBySentMethod.toSortedMap().mapNotNull { (method, frame) ->
                when {
                    method !in hostToCore -> "$method is not a host→core method of the descriptor"
                    frame.method != method -> "the sender of $method sent ${frame.method}"
                    frame.paramKeys != paramKeys(method) ->
                        "$method sends ${frame.paramKeys.sorted()}, the descriptor lists ${paramKeys(method).sorted()}"
                    else -> null
                }
            }
        val unsent = (hostToCore - framesBySentMethod.keys).sorted().map { "no sender drives $it" }
        return frameDrift + unsent
    }

    /** Lists the core→host handlers that read a key the descriptor does not list for their method. */
    fun coreToHostReadDrift(keysReadByMethod: Map<String, Set<String>>): List<String> =
        keysReadByMethod.toSortedMap().mapNotNull { (method, keysRead) ->
            val listed = methods[method]?.paramKeys.orEmpty()
            if (listed.containsAll(keysRead)) {
                null
            } else {
                "$method reads ${keysRead.sorted()}, the descriptor lists ${listed.sorted()}"
            }
        }

    /**
     * Compares the results the host replies with, keyed by the core→host
     * request each answers, with the descriptor's result keys.
     */
    fun coreToHostResultDrift(resultKeysByMethod: Map<String, Set<String>>): List<String> {
        val requestsWithResult = methods.filterValues { it.direction == CORE_TO_HOST && it.resultKeys != null }
        val resultDrift =
            resultKeysByMethod.toSortedMap().mapNotNull { (method, keys) ->
                val listed = requestsWithResult[method]?.resultKeys
                when {
                    listed == null -> "$method has no result in the descriptor"
                    keys != listed -> "$method replies ${keys.sorted()}, the descriptor lists ${listed.sorted()}"
                    else -> null
                }
            }
        val unanswered = (requestsWithResult.keys - resultKeysByMethod.keys).sorted().map { "no result answers $it" }
        return resultDrift + unanswered
    }

    private fun methodsIn(direction: String): Set<String> =
        methods.filterValues { it.direction == direction }.keys

    companion object {
        private const val HOST_TO_CORE = "hostToCore"
        private const val CORE_TO_HOST = "coreToHost"

        /** The committed `protocol.json`, whose path Gradle passes in. */
        fun committedJson(): String {
            val path =
                requireNotNull(System.getProperty("miragon.protocolDescriptor")) {
                    "miragon.protocolDescriptor is unset; run the test through Gradle"
                }
            return Files.readString(Path.of(path))
        }

        fun load(): ProtocolDescriptor = parse(committedJson())

        fun parse(json: String): ProtocolDescriptor =
            ProtocolDescriptor(
                JsonParser.parseString(json).asJsonArray
                    .map { it.asJsonObject }
                    .associate { entry ->
                        entry.get("method").asString to
                            DescriptorMethod(
                                direction = entry.get("direction").asString,
                                paramKeys = entry.getAsJsonArray("paramKeys").map { it.asString }.toSet(),
                                resultKeys = entry.getAsJsonArray("resultKeys")?.map { it.asString }?.toSet(),
                            )
                    },
            )
    }
}
