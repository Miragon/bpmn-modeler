package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalStore
import io.miragon.intellij.bpmn.pushPluginApprovalsToRunningBridges

/**
 * Stores the plugin approvals a bridge saves and mirrors them into every
 * running bridge. The approvals hold for the whole IDE, so a save in one
 * project window reaches the bridges of the others too.
 */
internal class PluginApprovalRouter(
    private val deps: BridgeDeps,
    // No CoreProcess runs under the test fixture, so a test observes the pushes here.
    private val pushToRunningBridges: () -> Unit = ::pushPluginApprovalsToRunningBridges,
) {
    private val store get() = PluginApprovalStore.getInstance()

    fun register() {
        deps.handlers.on("pluginApprovals/save") { params ->
            val approvals =
                params.jsonArray("approvals").map { row ->
                    requireNotNull(PluginApproval.fromJson(row)) { "Not a plugin approval: $row" }
                }
            RpcAction { id -> handleSave(approvals, id) }
        }
    }

    /** Pushes before it acks, so the saving bridge's mirror never lags its own write. */
    private fun handleSave(approvals: List<PluginApproval>, id: CoreRequestId?) {
        store.write(approvals)
        pushToRunningBridges()
        id?.let { deps.channel.reply(it, null) }
    }

    /** No-ops when no bridge is alive: the approvals are seeded again on the next `session/register`. */
    fun push() {
        if (!deps.isProcessAlive()) return
        deps.channel.notify(
            HostToCoreMethod.PLUGIN_APPROVALS_DID_CHANGE,
            linkedMapOf("approvals" to store.read()),
            coalesceKey = "pluginApprovals",
            reliable = true,
        )
    }
}
