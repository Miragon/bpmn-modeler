package io.miragon.intellij.bpmn.bridge

/** The project's trust as one frame carries it to the bridge. */
internal data class WorkspaceTrustSnapshot(val trusted: Boolean, val revision: Long) {
    fun toParams(): Map<String, Any> = linkedMapOf("trusted" to trusted, "revision" to revision)
}

/**
 * The IDE's trust of one project, read for the bridge. A register frame and a
 * push travel on different queues in the bridge, so each read carries a new
 * revision and the bridge keeps the newest; reading and counting under one
 * lock keeps a newer revision from carrying an older read.
 */
internal class ProjectTrust(private val isTrusted: () -> Boolean) {
    private var revision = 0L

    @Synchronized
    fun snapshot(): WorkspaceTrustSnapshot = WorkspaceTrustSnapshot(isTrusted(), ++revision)
}
