package io.miragon.intellij.bpmn.bridge

/**
 * Identifies one core request. [value] is unique only within one bridge process,
 * because a respawned bridge numbers its requests from 1 again, so the id also
 * carries the [generation] of the process that sent it.
 */
internal data class CoreRequestId(val value: Int, val generation: Int) {
    fun wasSentBy(processGeneration: Int?): Boolean = generation == processGeneration
}
