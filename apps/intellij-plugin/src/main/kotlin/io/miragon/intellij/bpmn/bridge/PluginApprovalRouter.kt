package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalChange
import io.miragon.intellij.bpmn.PluginApprovalSnapshot
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.pushToRunningBridges

/**
 * Merges the approval changes a bridge sends into the IDE's store and mirrors
 * the stored list into every running bridge. The approvals hold for the whole
 * IDE, so a change in one project window reaches the bridges of the others too.
 */
internal class PluginApprovalRouter(
    private val deps: BridgeDeps,
    // No CoreProcess runs under the test fixture, so a test observes the pushes here.
    private val pushToRunningBridges: () -> Unit = { pushToRunningBridges(ReplicatedStateKind.PLUGIN_APPROVALS) },
) : ReplicatedState {
    override val kind = ReplicatedStateKind.PLUGIN_APPROVALS

    private val store get() = PluginApprovalStore.getInstance()

    fun register() {
        deps.handlers.on("pluginApprovals/change") { params ->
            val allow =
                params.jsonArray("allow").map { row ->
                    requireNotNull(PluginApproval.fromJson(row)) { "Not a plugin approval: $row" }
                }
            val revoke =
                params.jsonArray("revoke").map { id ->
                    requireNotNull(id.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString) {
                        "Not a plugin id: $id"
                    }
                }
            val change = PluginApprovalChange(allow, revoke)
            RpcAction { id -> handleChange(change, id) }
        }
        deps.handlers.on("pluginApprovals/read") {
            RpcAction { id -> id?.let { deps.channel.reply(it, PluginApprovalsResult(store.snapshot())) } }
        }
    }

    /**
     * Pushes before it answers, so the changing bridge's mirror never lags its
     * own change. Each carries the revision it read, at least the change's, and
     * no lock is held while they are queued: the bridge keeps the newest revision.
     */
    private fun handleChange(change: PluginApprovalChange, id: CoreRequestId?) {
        val outcome = store.change(change)
        if (outcome.changed) pushToRunningBridges()
        id?.let { deps.channel.reply(it, PluginApprovalsResult(outcome.snapshot)) }
    }

    /**
     * Rides on the register, so the page's first plugin query never races a
     * separate seed and reads approved plugins as new. Read with its revision,
     * so a register the bridge applies after a newer push cannot roll its mirror back.
     */
    override fun registerSeed(): Map<String, Any?> {
        val snapshot = store.snapshot()
        return linkedMapOf("pluginApprovals" to snapshot.approvals, "pluginApprovalsRevision" to snapshot.revision)
    }

    override fun push() = push(store.snapshot())

    /**
     * Not coalesced: changes push from each project's reader thread, so a frame queued
     * later can carry an older revision and must not replace the newer one.
     */
    fun push(snapshot: PluginApprovalSnapshot) {
        if (!deps.isProcessAlive()) return
        deps.channel.notify(
            HostToCoreMethod.PLUGIN_APPROVALS_DID_CHANGE,
            linkedMapOf("approvals" to snapshot.approvals, "revision" to snapshot.revision),
            reliable = true,
        )
    }
}
