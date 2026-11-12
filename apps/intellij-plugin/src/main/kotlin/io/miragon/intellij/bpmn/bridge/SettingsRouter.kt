package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Stores the user's language and lint choices across projects and restarts,
 * as VS Code's User settings do.
 */
internal class SettingsRouter(
    private val deps: BridgeDeps,
    private val pushToRunningBridges: () -> Unit = ::pushSettingsToRunningBridges,
) {
    fun register() {
        deps.handlers.on("settings/setLanguage") { params ->
            val locale = params.string("locale")
            RpcAction { id ->
                if (ModelerSettingsStore.getInstance().setLanguage(locale)) pushToRunningBridges()
                id?.let { deps.channel.reply(it, null) }
            }
        }
        deps.handlers.on("settings/setLintingEnabled") { params ->
            val enabled = params.boolean("enabled")
            RpcAction { id -> handleSetLintingEnabled(enabled, id) }
        }
    }

    /** Pushes before it acks: the bridge flips the widget's next click from the pushed snapshot. */
    private fun handleSetLintingEnabled(enabled: Boolean, id: CoreRequestId?) {
        ModelerSettingsStore.getInstance().setLintingEnabled(enabled)
        pushToRunningBridges()
        id?.let { deps.channel.reply(it, null) }
    }
}
