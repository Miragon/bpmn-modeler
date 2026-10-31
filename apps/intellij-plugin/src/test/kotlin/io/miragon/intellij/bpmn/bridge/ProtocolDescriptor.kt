package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import java.nio.file.Files
import java.nio.file.Path

/** The method and top-level param keys of one host→core frame a Kotlin sender wrote. */
internal data class SentFrame(val method: String, val paramKeys: Set<String>)

/**
 * The bridge's committed protocol descriptor (`protocol.json`) and the checks
 * that hold the Kotlin host to it. Each check returns one line per mismatch, so
 * an empty list means the host agrees with the descriptor.
 */
internal class ProtocolDescriptor private constructor(
    private val methods: Map<String, DescriptorMethod>,
) {
    private class DescriptorMethod(val direction: String, val paramKeys: Set<String>)

    fun hostToCoreMethods(): Set<String> = methodsIn(HOST_TO_CORE)

    fun coreToHostMethods(): Set<String> = methodsIn(CORE_TO_HOST)

    fun paramKeys(method: String): Set<String> =
        requireNotNull(methods[method]) { "$method is not in the protocol descriptor" }.paramKeys

    /**
     * Compares the frames the Kotlin senders wrote, keyed by the method each
     * sender must write, with the descriptor's host→core methods and keys.
     */
    fun hostToCoreDrift(framesBySentMethod: Map<String, SentFrame>): List<String> = emptyList()

    /** Lists the keys a core→host handler reads that the descriptor does not list for its method. */
    fun coreToHostReadDrift(keysReadByMethod: Map<String, Set<String>>): List<String> = emptyList()

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
                            )
                    },
            )
    }
}
