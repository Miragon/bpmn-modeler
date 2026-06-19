package io.miragon.intellij.bpmn.bridge

/**
 * The one host-UI capability [ProcessSupervisor] needs: surface a fatal bridge
 * error — a spawn failure or a repeated-crash give-up — to the user.
 *
 * Narrowing the dependency to this single method (rather than the whole
 * `HostNotifications`) keeps the supervisor host-agnostic and lets tests assert
 * error reporting with a trivial fake instead of a platform-coupled notifier
 * that can't run outside a live IDE. Production adapts it to `HostNotifications`
 * in `CoreProcess`, preserving the lazy construction on the happy path.
 */
internal fun interface BridgeErrorNotifier {
    fun showError(message: String)
}
