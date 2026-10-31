package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Stores the lint choice the bridge reports from the editor's toggle or the
 * BPMNlint widget. The choice is the user's, so it holds for every project and
 * across restarts, as VS Code's User setting does.
 */
internal class SettingsRouter(
    private val deps: BridgeDeps,
    private val pushToRunningBridges: () -> Unit = ::pushSettingsToRunningBridges,
) {
    fun register() {
        deps.handlers.on("settings/setLintingEnabled") { params ->
            val enabled = params.boolean("enabled")
            RpcAction { id -> handleSetLintingEnabled(enabled, id) }
        }
    }

    /** Pushes before it acks: the bridge flips the widget's next click from the pushed snapshot. */
    private fun handleSetLintingEnabled(enabled: Boolean, id: Int?) {
        ModelerSettingsStore.getInstance().setLintingEnabled(enabled)
        pushToRunningBridges()
        id?.let { deps.channel.reply(it, null) }
    }
}
