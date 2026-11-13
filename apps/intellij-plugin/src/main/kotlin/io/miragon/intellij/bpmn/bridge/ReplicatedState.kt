package io.miragon.intellij.bpmn.bridge

/**
 * Which running bridges a change of a replicated state may reach. The router
 * still picks the reach of each change by its scope; this only stops a state
 * of one project from fanning out.
 */
internal enum class ChangeReach {
    /** The state reads an application-level store, so some of its changes reach every bridge. */
    EVERY_BRIDGE,

    /** The state is the project's own, so only its bridge reads it. */
    OWN_BRIDGE,
}

/**
 * Names one replicated state across the bridges of every project window, so a
 * fan-out finds the same state in each.
 */
internal enum class ReplicatedStateKind(val reach: ChangeReach) {
    DEPLOYMENT_STATE(ChangeReach.OWN_BRIDGE),
    SETTINGS(ChangeReach.EVERY_BRIDGE),
    TEMPLATE_PREFERENCES(ChangeReach.EVERY_BRIDGE),
    PLUGIN_APPROVALS(ChangeReach.EVERY_BRIDGE),
    WORKSPACE_TRUST(ChangeReach.OWN_BRIDGE),
}

/**
 * A state the host owns and mirrors into its bridge for the core's synchronous
 * reads. [BridgeRouters.replicatedStates] lists every one, and the
 * `session/register` frame, the seed after a spawn and the fan-out walk that list.
 */
internal interface ReplicatedState {
    val kind: ReplicatedStateKind

    /** The entries this state adds to a `session/register` frame; empty when only [push] seeds it. */
    fun registerSeed(): Map<String, Any?>

    /** Mirrors the stored state into this bridge. No-ops when no bridge is alive: the next spawn seeds it again. */
    fun push()
}
