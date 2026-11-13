package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Stores the user's language and lint choices across projects and restarts,
 * as VS Code's User settings do, and mirrors the settings snapshot into the bridge.
 */
internal class SettingsRouter(
    private val deps: BridgeDeps,
    private val pushToRunningBridges: () -> Unit = ::pushSettingsToRunningBridges,
) : ReplicatedState {
    override val kind = ReplicatedStateKind.SETTINGS

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

    // Seeds the core's SettingsPort before it scans templates, so the very first discovery uses the configured folder.
    override fun registerSeed(): Map<String, Any?> = mapOf("settings" to snapshot())

    /** Lets an open editor react live: a language re-render, a config folder template reload. */
    override fun push() {
        if (!deps.isProcessAlive()) return
        deps.channel.notify(HostToCoreMethod.SETTINGS_DID_CHANGE, linkedMapOf("settings" to snapshot()))
    }

    private fun snapshot() = ModelerSettingsStore.getInstance().snapshotMap(deps.project)
}
