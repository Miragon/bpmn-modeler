package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalChange
import io.miragon.intellij.bpmn.PluginApprovalSnapshot
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.pushPluginApprovalsToRunningBridges

/**
 * Merges the approval changes a bridge sends into the IDE's store and mirrors
 * the stored list into every running bridge. The approvals hold for the whole
 * IDE, so a change in one project window reaches the bridges of the others too.
 */
internal class PluginApprovalRouter(
    private val deps: BridgeDeps,
    // No CoreProcess runs under the test fixture, so a test observes the pushes here.
    private val pushToRunningBridges: (PluginApprovalSnapshot) -> Unit = ::pushPluginApprovalsToRunningBridges,
) {
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
    }

    /**
     * Pushes before it answers, so the changing bridge's mirror never lags its
     * own change. Both carry the revision the change was stored at, and no lock
     * is held while they are queued: the bridge keeps the newest revision.
     */
    private fun handleChange(change: PluginApprovalChange, id: CoreRequestId?) {
        val outcome = store.change(change)
        if (outcome.changed) pushToRunningBridges(outcome.snapshot)
        id?.let { deps.channel.reply(it, PluginApprovalsResult(outcome.snapshot)) }
    }

    /** No-ops when no bridge is alive: the approvals are seeded again on the next `session/register`. */
    fun push(snapshot: PluginApprovalSnapshot) {
        if (!deps.isProcessAlive()) return
        deps.channel.notify(
            HostToCoreMethod.PLUGIN_APPROVALS_DID_CHANGE,
            linkedMapOf("approvals" to snapshot.approvals, "revision" to snapshot.revision),
            coalesceKey = "pluginApprovals",
            reliable = true,
        )
    }
}
